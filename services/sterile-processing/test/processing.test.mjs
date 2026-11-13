import { independentInspector } from "../../../packages/sterile-processing/test/memory-repository.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  ProcessingRegistry,
  InstrumentRegistry,
  TrayRegistry,
} from "@intrusionshield/sterile-processing";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
import { createSterilePreview } from "../dist/development/preview.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
const receive = (id, extra = {}) => ({
  requestId: randomUUID(),
  code: "REC-001",
  source: "Dummy OR",
  custodian: "Demo handover",
  condition: "Used demo instrument",
  discrepancies: "",
  instrumentIds: [id],
  confirmed: true,
  ...extra,
});
const start = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  method: "manual",
  procedure: "SOP-DEMO",
  procedureVersion: "1",
  equipment: "",
  confirmed: true,
  ...extra,
});
const finish = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  outcome: "passed",
  evidence: "EVID-DEMO",
  note: "",
  confirmed: true,
  ...extra,
});
async function httpFixture(t) {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  const dir = mkdtempSync(join(tmpdir(), "sterile-trays-http-")),
    repo = new PreviewSqliteRepository(join(dir, "registry.sqlite")),
    preview = createSterilePreview({ origin, repository: repo });
  server.on("request", preview.app);
  t.after(
    () =>
      new Promise((resolve) =>
        server.close(() => {
          preview.dispose();
          repo.close();
          rmSync(dir, { recursive: true, force: true });
          resolve();
        }),
      ),
  );
  let cookie = "",
    session;
  async function call(path, body, headers = {}) {
    const r = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body === undefined
          ? {}
          : {
              origin,
              "content-type": "application/json",
              "x-sterile-csrf": session?.csrf ?? "",
            }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  }
  async function login(role = "operator") {
    session = await (await call("/preview/session")).json();
    session = await (await call("/preview/login", { role })).json();
    return session;
  }
  const s = await login(),
    base = "/api/v1/sterile/facilities/" + s.facilityId;
  const type = await (
    await call(base + "/instrument-types", {
      requestId: randomUUID(),
      code: "CLAMP",
      name: "Pinza",
      manufacturer: "",
      model: "",
    })
  ).json();
  const i = await (
    await call(base + "/instruments", {
      requestId: randomUUID(),
      instrumentTypeId: type.id,
      code: "INS-001",
      serialNumber: "",
    })
  ).json();
  return {
    call,
    login,
    base,
    type,
    i,
    get session() {
      return session;
    },
  };
}
test("processing HTTP workflow retains failed attempt, frozen snapshots and hold after cleaning", async (t) => {
  const f = await httpFixture(t);
  let r = await f.call(f.base + "/processing", receive(f.i.id));
  assert.equal(r.status, 201);
  let e = await r.json();
  r = await f.call(f.base + "/processing/" + e.id + "/start", start(1));
  assert.equal(r.status, 200);
  r = await f.call(
    f.base + "/processing/" + e.id + "/finish",
    finish(2, { outcome: "failed", note: "Visible residue" }),
  );
  assert.equal(r.status, 200);
  await f.call(f.base + "/processing/" + e.id + "/start", start(3));
  r = await f.call(f.base + "/processing/" + e.id + "/finish", finish(4));
  assert.equal(r.status, 200);
  e = await r.json();
  assert.equal(e.state, "awaiting_inspection");
  assert.equal(e.attempts[0].outcome, "failed");
  assert.equal(e.attempts[1].outcome, "passed");
  const v = await (
    await f.call(f.base + "/processing/" + e.id + "/versions/1")
  ).json();
  assert.equal(v.state, "received");
  assert.equal(v.attempts.length, 0);
  const h = await (
    await f.call(f.base + "/processing/" + e.id + "/history")
  ).json();
  assert.equal(h.items.length, 5);
  const instrument = await (
    await f.call(f.base + "/instruments/" + f.i.id)
  ).json();
  assert.equal(instrument.processingHold.episodeId, e.id);
  r = await f.call(f.base + "/instruments/" + f.i.id + "/retire", {
    requestId: randomUUID(),
    version: 1,
    reason: "Dummy",
  });
  assert.equal(r.status, 409);
});
test("processing HTTP rejects forged scope, extra query/body, CSRF omission, stale or unconfirmed changes", async (t) => {
  const f = await httpFixture(t);
  for (const b of [
    receive(f.i.id, { tenantId: randomUUID() }),
    receive(f.i.id, { confirmed: false }),
  ])
    assert.equal((await f.call(f.base + "/processing", b)).status, 400);
  assert.equal(
    (await f.call(f.base + "/processing?extra=1", receive(f.i.id))).status,
    400,
  );
  assert.equal(
    (
      await f.call(f.base + "/processing", receive(f.i.id), {
        "x-sterile-csrf": "",
      })
    ).status,
    403,
  );
  const e = await (
    await f.call(f.base + "/processing", receive(f.i.id))
  ).json();
  assert.equal(
    (await f.call(f.base + "/processing/" + e.id + "/start", start(2))).status,
    409,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/processing/" + e.id + "/start",
        start(1, { confirmed: false }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/processing/" + e.id + "/start",
        start(1, { actorId: randomUUID() }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/processing/" +
          e.id,
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.call(f.base + "/processing/" + e.id + "/versions/0")).status,
    400,
  );
});
test("auditor can read processing versions/history but all processing writes are denied", async (t) => {
  const f = await httpFixture(t),
    e = await (await f.call(f.base + "/processing", receive(f.i.id))).json();
  await f.login("viewer");
  for (const suffix of [
    "",
    "/" + e.id,
    "/" + e.id + "/versions/1",
    "/" + e.id + "/history",
  ])
    assert.equal((await f.call(f.base + "/processing" + suffix)).status, 200);
  for (const [path, body] of [
    ["", receive(f.i.id, { code: "REC-2" })],
    ["/" + e.id + "/start", start(1)],
    ["/" + e.id + "/finish", finish(2)],
  ])
    assert.equal(
      (await f.call(f.base + "/processing" + path, body)).status,
      403,
    );
});
async function sqlFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "processing-sql-")),
    file = join(dir, "preview.sqlite"),
    repo = new PreviewSqliteRepository(file),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    ir = new InstrumentRegistry(repo);
  const type = await ir.createType(s, {
      requestId: randomUUID(),
      code: "CLAMP",
      name: "Clamp",
      manufacturer: "",
      model: "",
    }),
    i = await ir.register(s, {
      requestId: randomUUID(),
      code: "INS",
      instrumentTypeId: type.id,
      serialNumber: "",
    });
  t.after(() => {
    try {
      repo.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, file, repo, s, i, ir };
}
test("real SQLite persists processing snapshots and holds across reopening without altering existing trays", async (t) => {
  const f = await sqlFixture(t),
    pr = new ProcessingRegistry(f.repo);
  let e = await pr.receive(f.s, receive(f.i.id));
  e = await pr.start(f.s, e.id, start(1));
  e = await pr.finish(f.s, e.id, finish(2));
  const r = new PreviewSqliteRepository(f.file);
  try {
    const p = new ProcessingRegistry(r);
    assert.deepEqual(await p.get(f.s, e.id), e);
    assert.equal((await p.get(f.s, e.id, 1)).attempts.length, 0);
    assert.equal(
      (await new InstrumentRegistry(r).get(f.s, f.i.id)).processingHold
        .episodeId,
      e.id,
    );
    assert.equal((await p.history(f.s, e.id)).items.length, 3);
  } finally {
    r.close();
  }
});
test("separate SQLite connections cannot reserve an instrument twice or overwrite newer results", async (t) => {
  const f = await sqlFixture(t),
    r = new PreviewSqliteRepository(f.file);
  try {
    const a = new ProcessingRegistry(f.repo),
      b = new ProcessingRegistry(r);
    const results = await Promise.allSettled([
      a.receive(f.s, receive(f.i.id)),
      b.receive(f.s, receive(f.i.id, { code: "REC-OTHER" })),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "PROCESSING_HOLD",
    );
    const e = results.find((x) => x.status === "fulfilled").value;
    await a.start(f.s, e.id, start(1));
    await assert.rejects(
      b.start(f.s, e.id, start(1)),
      (x) => x.code === "CONFLICT",
    );
  } finally {
    r.close();
  }
});
test("SQLite audit failure rolls back processing, holds, versions and idempotency before retry", async (t) => {
  const f = await sqlFixture(t);
  const broken = {
    transaction: (s, work) =>
      f.repo.transaction(s, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw Error("synthetic audit failure");
          },
        }),
      ),
  };
  const body = receive(f.i.id);
  await assert.rejects(new ProcessingRegistry(broken).receive(f.s, body));
  assert.equal(
    (await new ProcessingRegistry(f.repo).list(f.s)).items.length,
    0,
  );
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold, undefined);
  const e = await new ProcessingRegistry(f.repo).receive(f.s, body);
  assert.equal(e.version, 1);
  assert.equal(
    (await new ProcessingRegistry(f.repo).history(f.s, e.id)).items.length,
    1,
  );
});
test("SQLite failed result audit cannot commit a pass or its historical snapshot", async (t) => {
  const f = await sqlFixture(t),
    p = new ProcessingRegistry(f.repo);
  let e = await p.receive(f.s, receive(f.i.id));
  e = await p.start(f.s, e.id, start(1));
  const command = finish(2);
  const broken = {
    transaction: (s, work) =>
      f.repo.transaction(s, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw Error("synthetic audit failure");
          },
        }),
      ),
  };
  await assert.rejects(
    new ProcessingRegistry(broken).finish(f.s, e.id, command),
  );
  assert.equal((await p.get(f.s, e.id)).state, "cleaning");
  assert.equal((await p.get(f.s, e.id)).attempts[0].outcome, null);
  await assert.rejects(p.get(f.s, e.id, 3), (x) => x.code === "NOT_FOUND");
  const saved = await p.finish(f.s, e.id, command);
  assert.equal(saved.state, "awaiting_inspection");
  assert.equal((await p.history(f.s, e.id)).items.length, 3);
});
const inspectBody = (id, version = 3) => ({
  requestId: randomUUID(),
  version,
  procedure: "INSPECT-DEMO",
  procedureVersion: "1",
  evidence: "INSPECT-EVID-DEMO",
  confirmed: true,
  items: [
    {
      instrumentId: id,
      clean: true,
      dry: true,
      intact: true,
      functional: true,
      note: "",
    },
  ],
});
test("HTTP inspection enforces cleaning, confirmation, exact items, CSRF and viewer denial", async (t) => {
  const f = await httpFixture(t);
  const e = await (
      await f.call(f.base + "/processing", receive(f.i.id))
    ).json(),
    path = f.base + "/processing/" + e.id + "/inspect";
  assert.equal((await f.call(path, inspectBody(f.i.id, 1))).status, 403);
  await f.call(f.base + "/processing/" + e.id + "/start", start(1));
  await f.call(f.base + "/processing/" + e.id + "/finish", finish(2));
  await f.login("reviewer");
  assert.equal(
    (await f.call(path, { ...inspectBody(f.i.id), confirmed: false })).status,
    400,
  );
  assert.equal(
    (await f.call(path, { ...inspectBody(f.i.id), actorId: randomUUID() }))
      .status,
    400,
  );
  assert.equal(
    (await f.call(path, inspectBody(f.i.id), { "x-sterile-csrf": "" })).status,
    403,
  );
  await f.login("viewer");
  assert.equal((await f.call(path, inspectBody(f.i.id))).status, 403);
  await f.login("reviewer");
  const r = await f.call(path, inspectBody(f.i.id));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).state, "ready_for_assembly");
  const i = await (await f.call(f.base + "/instruments/" + f.i.id)).json();
  assert.equal(i.processingHold, undefined);
});
test("SQLite inspection release and audit are atomic and survive reopening", async (t) => {
  const f = await sqlFixture(t),
    p = new ProcessingRegistry(f.repo);
  const e = await p.receive(f.s, receive(f.i.id));
  await p.start(f.s, e.id, start(1));
  await p.finish(f.s, e.id, finish(2));
  const body = inspectBody(f.i.id),
    broken = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("synthetic failure");
            },
          }),
        ),
    };
  await assert.rejects(
    new ProcessingRegistry(broken).inspect(
      independentInspector(f.s),
      e.id,
      body,
    ),
  );
  assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  await p.inspect(independentInspector(f.s), e.id, body);
  const r = new PreviewSqliteRepository(f.file);
  try {
    const x = await new ProcessingRegistry(r).get(f.s, e.id);
    assert.equal(x.inspections[0].outcome, "passed");
    assert.equal(
      (await new InstrumentRegistry(r).get(f.s, f.i.id)).processingHold,
      undefined,
    );
    assert.equal(
      (await new ProcessingRegistry(r).get(f.s, e.id, 3)).state,
      "awaiting_inspection",
    );
  } finally {
    r.close();
  }
});
test("fictional inspection setup is operator-only, CSRF-protected, idempotent and preserves existing records", async (t) => {
  const f = await httpFixture(t),
    key = randomUUID();
  assert.equal(
    (
      await f.call(
        "/preview/inspection-example",
        { requestId: key },
        { "x-sterile-csrf": "" },
      )
    ).status,
    403,
  );
  await f.login("viewer");
  assert.equal(
    (await f.call("/preview/inspection-example", { requestId: key })).status,
    403,
  );
  await f.login();
  const a = await f.call("/preview/inspection-example", { requestId: key });
  assert.equal(a.status, 201);
  const e = await a.json();
  assert.equal(e.state, "awaiting_inspection");
  assert.equal(e.instruments.length, 1);
  assert.match(e.attempts[0].evidence, /SIMULATED/);
  assert.deepEqual(
    await (
      await f.call("/preview/inspection-example", { requestId: key })
    ).json(),
    e,
  );
  const original = await (
    await f.call(f.base + "/instruments/" + f.i.id)
  ).json();
  assert.equal(original.code, f.i.code);
  assert.equal(original.processingHold, undefined);
});
test("fictional setup rolls back its catalogue, instrument, episode and holds on audit failure", async (t) => {
  const f = await sqlFixture(t);
  const { prepareInspectionExample } =
    await import("../dist/development/inspection-example.js");
  const broken = {
    transaction: (s, work) =>
      f.repo.transaction(s, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw Error("synthetic failure");
          },
        }),
      ),
  };
  const before = await f.ir.listTypes(f.s);
  await assert.rejects(prepareInspectionExample(broken, f.s, randomUUID()));
  assert.deepEqual(await f.ir.listTypes(f.s), before);
  assert.equal((await f.ir.list(f.s)).items.length, 1);
  assert.equal(
    (await new ProcessingRegistry(f.repo).list(f.s)).items.length,
    0,
  );
});

const correctionBody = (old, patch = {}) => ({
  requestId: randomUUID(),
  version: old.version,
  source: "CORRECTED-DEMO-SOURCE",
  custodian: old.custodian,
  condition: old.condition,
  discrepancies: old.discrepancies,
  reason: "SIMULATED clerical correction",
  reference: "SIMULATED-CORRECTION",
  confirmed: true,
  ...patch,
});
test("receipt correction HTTP is reviewer-authorized, strict/CSRF protected and never releases processing holds", async (t) => {
  const f = await httpFixture(t),
    old = await (await f.call(f.base + "/processing", receive(f.i.id))).json(),
    path = f.base + "/processing/" + old.id + "/correct-receipt",
    body = correctionBody(old);
  assert.equal((await f.call(path, body)).status, 403);
  await f.login("viewer");
  assert.equal((await f.call(path, body)).status, 403);
  await f.login("reviewer");
  assert.equal(f.session.canCorrectReceipt, true);
  assert.equal(f.session.canWrite, false);
  assert.equal(
    (await f.call(path, body, { "x-sterile-csrf": "" })).status,
    403,
  );
  for (const extra of [
    { instrumentIds: [] },
    { code: "REPLACEMENT" },
    { actorId: randomUUID() },
    { state: "ready_for_assembly" },
    { personId: randomUUID() },
  ])
    assert.equal((await f.call(path, { ...body, ...extra })).status, 400);
  const response = await f.call(path, body);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.version, 2);
  assert.equal(saved.state, "received");
  assert.equal(saved.receiptCorrections[0].actorId, f.session.actorId);
  assert.equal(saved.receiptCorrections[0].personId, f.session.personId);
  assert.deepEqual(await (await f.call(path, body)).json(), saved);
  assert.equal(
    (
      await (
        await f.call(f.base + "/processing/" + old.id + "/versions/1")
      ).json()
    ).source,
    old.source,
  );
  assert.ok(
    (await (await f.call(f.base + "/instruments/" + f.i.id)).json())
      .processingHold,
  );
  assert.equal((await f.call(path + "?ignored=true", body)).status, 400);
  await f.login();
  await f.call(f.base + "/processing/" + old.id + "/start", start(2));
  await f.login("reviewer");
  assert.equal(
    (
      await f.call(
        path,
        correctionBody(saved, { version: 3, source: "TOO-LATE" }),
      )
    ).status,
    409,
  );
});
test("SQLite receipt corrections survive restart with retained original versions and rollback failed audit writes", async (t) => {
  const f = await sqlFixture(t),
    p = new ProcessingRegistry(f.repo),
    old = await p.receive(f.s, receive(f.i.id)),
    body = correctionBody(old);
  const broken = new ProcessingRegistry({
    transaction: (scope, work) =>
      f.repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw new Error("simulated correction audit failure");
          },
        }),
      ),
  });
  await assert.rejects(
    () => broken.correctReceipt(f.s, old.id, body),
    /simulated/,
  );
  assert.equal((await p.get(f.s, old.id)).version, 1);
  await assert.rejects(
    () => p.get(f.s, old.id, 2),
    (e) => e.code === "NOT_FOUND",
  );
  const saved = await p.correctReceipt(f.s, old.id, body),
    reopened = new PreviewSqliteRepository(f.file);
  try {
    const read = new ProcessingRegistry(reopened);
    assert.deepEqual(await read.get(f.s, old.id), saved);
    assert.equal((await read.get(f.s, old.id, 1)).source, old.source);
    assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  } finally {
    reopened.close();
  }
});
test("separate SQLite connections serialize correction versus cleaning without overwriting either event", async (t) => {
  const f = await sqlFixture(t),
    p = new ProcessingRegistry(f.repo),
    old = await p.receive(f.s, receive(f.i.id)),
    second = new PreviewSqliteRepository(f.file);
  try {
    const results = await Promise.allSettled([
      p.correctReceipt(f.s, old.id, correctionBody(old)),
      new ProcessingRegistry(second).start(f.s, old.id, start(1)),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.filter(
        (x) => x.status === "rejected" && x.reason.code === "CONFLICT",
      ).length,
      1,
    );
    assert.equal((await p.get(f.s, old.id)).version, 2);
    assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  } finally {
    second.close();
  }
});

const cancelBody = (version = 1, extra = {}) => ({
  requestId: randomUUID(),
  version,
  reason: "SIMULATED wrong receipt",
  reference: "SIMULATED-CANCEL",
  confirmed: true,
  ...extra,
});
test("receipt cancellation HTTP requires separate reviewer permission, trusted payload, CSRF and preserves readable versions", async (t) => {
  const f = await httpFixture(t),
    old = await (await f.call(f.base + "/processing", receive(f.i.id))).json(),
    path = f.base + "/processing/" + old.id + "/cancel-receipt",
    body = cancelBody();
  assert.equal((await f.call(path, body)).status, 403);
  await f.login("viewer");
  assert.equal((await f.call(path, body)).status, 403);
  await f.login("reviewer");
  assert.equal(f.session.canCancelReceipt, true);
  assert.equal(f.session.canWrite, false);
  assert.equal(
    (await f.call(path, body, { "x-sterile-csrf": "" })).status,
    403,
  );
  for (const extra of [
    { actorId: randomUUID() },
    { personId: randomUUID() },
    { instrumentIds: [] },
    { state: "cancelled" },
  ])
    assert.equal((await f.call(path, { ...body, ...extra })).status, 400);
  assert.equal((await f.call(path + "?extra=true", body)).status, 400);
  const result = await f.call(path, body);
  assert.equal(result.status, 200);
  const saved = await result.json();
  assert.equal(saved.state, "cancelled");
  assert.equal(saved.cancellation.actorId, f.session.actorId);
  assert.equal(saved.cancellation.personId, f.session.personId);
  assert.deepEqual(await (await f.call(path, body)).json(), saved);
  assert.equal(
    (
      await (
        await f.call(f.base + "/processing/" + old.id + "/versions/1")
      ).json()
    ).state,
    "received",
  );
  assert.equal(
    !!(await (await f.call(f.base + "/instruments/" + f.i.id)).json())
      .processingHold,
    false,
  );
  await f.login();
  assert.equal(
    (await f.call(f.base + "/processing/" + old.id + "/start", start(2)))
      .status,
    409,
  );
});
test("SQLite cancellation rollback, restart and cross-connection start race preserve consistent holds", async (t) => {
  const f = await sqlFixture(t),
    p = new ProcessingRegistry(f.repo),
    old = await p.receive(f.s, receive(f.i.id)),
    body = cancelBody();
  const broken = new ProcessingRegistry({
    transaction: (scope, work) =>
      f.repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw Error("simulated cancellation audit failure");
          },
        }),
      ),
  });
  await assert.rejects(
    () => broken.cancelReceipt(f.s, old.id, body),
    /simulated/,
  );
  assert.equal((await p.get(f.s, old.id)).version, 1);
  assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  const second = new PreviewSqliteRepository(f.file);
  try {
    const results = await Promise.allSettled([
      p.cancelReceipt(f.s, old.id, body),
      new ProcessingRegistry(second).start(f.s, old.id, start(1)),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.filter(
        (x) => x.status === "rejected" && x.reason.code === "CONFLICT",
      ).length,
      1,
    );
    const saved = await new ProcessingRegistry(second).get(f.s, old.id);
    assert.equal(saved.state, "cancelled");
    assert.equal(!!(await f.ir.get(f.s, f.i.id)).processingHold, false);
    assert.equal(
      (await new ProcessingRegistry(second).get(f.s, old.id, 1)).state,
      "received",
    );
  } finally {
    second.close();
  }
});
