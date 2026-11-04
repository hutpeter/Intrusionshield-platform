import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  InstrumentRegistry,
  TrayRegistry,
  PackagingRegistry,
  CycleRegistry,
} from "@intrusionshield/sterile-processing";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
import { createSterilePreview } from "../dist/development/preview.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
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
const createBody = (p, extra = {}) => ({
  requestId: randomUUID(),
  code: "LOAD-1",
  sterilizer: "STER-1",
  method: "steam",
  profile: "PROFILE-DEMO",
  profileVersion: "1",
  packageIds: [p.id],
  confirmed: true,
  ...extra,
});
const startBody = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  cycleReference: "CYCLE-1",
  confirmed: true,
  ...extra,
});
const resultBody = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  outcome: "passed",
  cycleEvidence: "CYCLE-EVID-DEMO",
  indicatorEvidence: "INDICATOR-EVID-DEMO",
  note: "",
  confirmed: true,
  ...extra,
});
async function example(f) {
  const r = await f.call("/preview/cycle-example", { requestId: randomUUID() });
  assert.equal(r.status, 201);
  return r.json();
}
test("cycle HTTP success remains unreleased with retained package lock and immutable version history", async (t) => {
  const f = await httpFixture(t),
    l = await example(f);
  assert.equal(l.state, "running");
  const r = await f.call(f.base + "/loads/" + l.id + "/finish", resultBody(2));
  assert.equal(r.status, 200);
  const done = await r.json();
  assert.equal(done.state, "awaiting_review");
  assert.equal("released" in done, false);
  const p = await (
    await f.call(f.base + "/packages/" + l.packages[0].id)
  ).json();
  assert.equal(p.state, "packaged");
  assert.equal(p.activeLoad.state, "awaiting_review");
  assert.equal(
    (
      await f.call(f.base + "/packages/" + p.id + "/void", {
        requestId: randomUUID(),
        version: 1,
        reason: "Demo",
        confirmed: true,
      })
    ).status,
    409,
  );
  assert.equal(
    (await (await f.call(f.base + "/loads/" + l.id + "/versions/1")).json())
      .state,
    "draft",
  );
  assert.equal(
    (await (await f.call(f.base + "/loads/" + l.id + "/history")).json()).items
      .length,
    3,
  );
  assert.equal(
    (await (await f.call(f.base + "/instruments/" + f.i.id)).json())
      .activeAssembly,
    undefined,
  );
});
test("cycle API rejects forged scope, release flags, missing evidence, bad CSRF and stale versions", async (t) => {
  const f = await httpFixture(t),
    l = await example(f),
    path = f.base + "/loads/" + l.id + "/finish";
  for (const patch of [
    { released: true },
    { actorId: randomUUID() },
    { confirmed: false },
    { indicatorEvidence: "" },
    { cycleEvidence: "" },
  ])
    assert.equal((await f.call(path, resultBody(2, patch))).status, 400);
  assert.equal(
    (await f.call(path, resultBody(2), { "x-sterile-csrf": "" })).status,
    403,
  );
  assert.equal((await f.call(path, resultBody(1))).status, 409);
  assert.equal((await f.call(path + "?extra=1", resultBody(2))).status, 400);
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) + "/loads/" + l.id,
      )
    ).status,
    404,
  );
});
test("auditor can read cycle history but cannot create, edit, start, finish, cancel or prepare fictional loads", async (t) => {
  const f = await httpFixture(t),
    l = await example(f);
  await f.login("viewer");
  for (const suffix of [
    "",
    "/" + l.id,
    "/" + l.id + "/versions/1",
    "/" + l.id + "/history",
  ])
    assert.equal((await f.call(f.base + "/loads" + suffix)).status, 200);
  for (const [path, body] of [
    ["", createBody(l.packages[0])],
    [
      "/" + l.id + "/contents",
      {
        requestId: randomUUID(),
        version: 2,
        packageIds: [l.packages[0].id],
        confirmed: true,
      },
    ],
    ["/" + l.id + "/start", startBody(2)],
    ["/" + l.id + "/finish", resultBody(2)],
    [
      "/" + l.id + "/cancel",
      { requestId: randomUUID(), version: 2, reason: "Demo", confirmed: true },
    ],
  ])
    assert.equal((await f.call(f.base + "/loads" + path, body)).status, 403);
  assert.equal(
    (await f.call("/preview/cycle-example", { requestId: randomUUID() }))
      .status,
    403,
  );
});
async function sqlFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "cycles-sql-")),
    file = join(dir, "preview.sqlite"),
    repo = new PreviewSqliteRepository(file),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    };
  t.after(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const { preparePackagingExample } =
      await import("../dist/development/packaging-example.js"),
    a = await preparePackagingExample(repo, s, randomUUID());
  const p = await new PackagingRegistry(repo).pack(s, {
    requestId: randomUUID(),
    code: "PACK-1",
    assemblyId: a.id,
    assemblyVersion: a.version,
    material: "DEMO",
    materialLot: "DEMO",
    procedure: "DEMO",
    procedureVersion: "1",
    sealChecked: true,
    contentsChecked: true,
    confirmed: true,
  });
  return { repo, file, s, p };
}
test("SQLite cycle evidence, package hold, machine reference and historical versions survive reopening", async (t) => {
  const f = await sqlFixture(t),
    cy = new CycleRegistry(f.repo),
    l = await cy.create(f.s, createBody(f.p));
  await cy.start(f.s, l.id, startBody(1));
  await cy.finish(f.s, l.id, resultBody(2));
  const r = new PreviewSqliteRepository(f.file);
  try {
    const registry = new CycleRegistry(r);
    assert.equal((await registry.get(f.s, l.id)).state, "awaiting_review");
    assert.equal((await registry.get(f.s, l.id, 1)).outcome, null);
    assert.equal((await registry.list(f.s)).items[0].packageCount, 1);
    assert.equal(
      (await new PackagingRegistry(r).get(f.s, f.p.id)).activeLoad.loadId,
      l.id,
    );
    const machine = await r.transaction(f.s, (tx) =>
      tx.findMachineCycle("STER-1", "CYCLE-1"),
    );
    assert.equal(machine, l.id);
  } finally {
    r.close();
  }
});
test("SQLite load creation, start and result audit failures roll back memberships, machine reference and versions", async (t) => {
  const f = await sqlFixture(t),
    cy = new CycleRegistry(f.repo),
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
    },
    bad = new CycleRegistry(broken),
    body = createBody(f.p);
  await assert.rejects(bad.create(f.s, body));
  assert.equal(
    (await new PackagingRegistry(f.repo).get(f.s, f.p.id)).activeLoad,
    undefined,
  );
  const l = await cy.create(f.s, body),
    start = startBody(1);
  await assert.rejects(bad.start(f.s, l.id, start));
  assert.equal(
    await f.repo.transaction(f.s, (tx) =>
      tx.findMachineCycle("STER-1", "CYCLE-1"),
    ),
    null,
  );
  await cy.start(f.s, l.id, start);
  await assert.rejects(bad.finish(f.s, l.id, resultBody(2)));
  assert.equal((await cy.get(f.s, l.id)).state, "running");
  await assert.rejects(cy.get(f.s, l.id, 3), (e) => e.code === "NOT_FOUND");
});
test("separate SQLite connections cannot reserve one package for two loads", async (t) => {
  const f = await sqlFixture(t),
    r = new PreviewSqliteRepository(f.file);
  try {
    const results = await Promise.allSettled([
      new CycleRegistry(f.repo).create(f.s, createBody(f.p)),
      new CycleRegistry(r).create(f.s, createBody(f.p, { code: "LOAD-OTHER" })),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "LOAD_BLOCKED",
    );
  } finally {
    r.close();
  }
});
test("fictional cycle setup is CSRF protected, idempotent, atomic and preserves earlier records", async (t) => {
  const f = await httpFixture(t),
    key = randomUUID();
  assert.equal(
    (
      await f.call(
        "/preview/cycle-example",
        { requestId: key },
        { "x-sterile-csrf": "" },
      )
    ).status,
    403,
  );
  const l = await (
    await f.call("/preview/cycle-example", { requestId: key })
  ).json();
  assert.deepEqual(
    await (await f.call("/preview/cycle-example", { requestId: key })).json(),
    l,
  );
  const g = await sqlFixture(t),
    before = await new InstrumentRegistry(g.repo).list(g.s),
    { prepareCycleExample } =
      await import("../dist/development/cycle-example.js"),
    broken = {
      transaction: (s, work) =>
        g.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("synthetic failure");
            },
          }),
        ),
    };
  await assert.rejects(prepareCycleExample(broken, g.s, randomUUID()));
  assert.deepEqual(await new InstrumentRegistry(g.repo).list(g.s), before);
  assert.equal((await new CycleRegistry(g.repo).list(g.s)).items.length, 0);
});
test("SQLite draft edits and cancellation preserve versions and roll back all package releases on failed audit", async (t) => {
  const f = await sqlFixture(t),
    cy = new CycleRegistry(f.repo),
    { preparePackagingExample } =
      await import("../dist/development/packaging-example.js"),
    a = await preparePackagingExample(f.repo, f.s, randomUUID()),
    pk = new PackagingRegistry(f.repo),
    second = await pk.pack(f.s, {
      requestId: randomUUID(),
      code: "PACK-2",
      assemblyId: a.id,
      assemblyVersion: a.version,
      material: "DEMO",
      materialLot: "DEMO",
      procedure: "DEMO",
      procedureVersion: "1",
      sealChecked: true,
      contentsChecked: true,
      confirmed: true,
    });
  const l = await cy.create(f.s, createBody(f.p));
  await cy.contents(f.s, l.id, {
    requestId: randomUUID(),
    version: 1,
    packageIds: [f.p.id, second.id],
    confirmed: true,
  });
  assert.equal((await cy.get(f.s, l.id, 1)).packages.length, 1);
  const cancel = {
      requestId: randomUUID(),
      version: 2,
      reason: "Demo cancellation",
      confirmed: true,
    },
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
  await assert.rejects(new CycleRegistry(broken).cancel(f.s, l.id, cancel));
  for (const p of [f.p, second])
    assert.equal((await pk.get(f.s, p.id)).activeLoad.loadId, l.id);
  await cy.cancel(f.s, l.id, cancel);
  for (const p of [f.p, second])
    assert.equal((await pk.get(f.s, p.id)).activeLoad, undefined);
  assert.equal((await cy.get(f.s, l.id)).state, "cancelled");
});
