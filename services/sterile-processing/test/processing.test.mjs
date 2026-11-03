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
