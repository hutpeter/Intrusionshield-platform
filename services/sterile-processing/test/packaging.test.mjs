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
const packBody = (a, extra = {}) => ({
  requestId: randomUUID(),
  code: "PACK-1",
  assemblyId: a.id,
  assemblyVersion: a.version,
  material: "DEMO WRAP",
  materialLot: "LOT-1",
  procedure: "PACK-DEMO",
  procedureVersion: "1",
  sealChecked: true,
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
async function example(f) {
  const r = await f.call("/preview/packaging-example", {
    requestId: randomUUID(),
  });
  assert.equal(r.status, 201);
  return r.json();
}
test("HTTP packaging freezes inspected assembly, blocks disassembly and retains voided history", async (t) => {
  const f = await httpFixture(t),
    a = await example(f);
  let r = await f.call(f.base + "/packages", packBody(a));
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.equal(p.inspectionProofs.length, 1);
  assert.match(p.inspectionProofs[0].evidence, /SIMULATED/);
  assert.equal(p.state, "packaged");
  assert.equal(
    (
      await f.call(f.base + "/tray-assemblies/" + a.id + "/action", {
        requestId: randomUUID(),
        version: a.version,
        action: "disassemble",
        confirmed: true,
        reason: "Demo",
      })
    ).status,
    409,
  );
  r = await f.call(f.base + "/packages/" + p.id + "/void", {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo correction",
    confirmed: true,
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).state, "voided");
  assert.equal(
    (await (await f.call(f.base + "/packages/" + p.id + "/versions/1")).json())
      .state,
    "packaged",
  );
  assert.equal(
    (await (await f.call(f.base + "/packages/" + p.id + "/history")).json())
      .items.length,
    2,
  );
  const original = await (
    await f.call(f.base + "/instruments/" + f.i.id)
  ).json();
  assert.equal(original.code, f.i.code);
  assert.equal(original.processingHold, undefined);
});
test("packaging API enforces CSRF, role, scope, confirmations and strict body/query fields", async (t) => {
  const f = await httpFixture(t),
    a = await example(f);
  assert.equal(
    (await f.call(f.base + "/packages", packBody(a), { "x-sterile-csrf": "" }))
      .status,
    403,
  );
  for (const patch of [
    { confirmed: false },
    { sealChecked: false },
    { tenantId: randomUUID() },
    { expiresAt: "2099-01-01" },
  ])
    assert.equal(
      (await f.call(f.base + "/packages", packBody(a, patch))).status,
      400,
    );
  assert.equal(
    (await f.call(f.base + "/packages?extra=1", packBody(a))).status,
    400,
  );
  const p = await (await f.call(f.base + "/packages", packBody(a))).json();
  await f.login("viewer");
  for (const suffix of [
    "",
    "/" + p.id,
    "/" + p.id + "/versions/1",
    "/" + p.id + "/history",
  ])
    assert.equal((await f.call(f.base + "/packages" + suffix)).status, 200);
  assert.equal(
    (await f.call(f.base + "/packages", packBody(a, { code: "DENIED" })))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call(f.base + "/packages/" + p.id + "/void", {
        requestId: randomUUID(),
        version: 1,
        reason: "Demo",
        confirmed: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.call("/preview/packaging-example", { requestId: randomUUID() }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/packages/" +
          p.id,
      )
    ).status,
    404,
  );
});
async function sqlFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "packaging-sql-")),
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
    await import("../dist/development/packaging-example.js");
  const a = await preparePackagingExample(repo, s, randomUUID());
  return { repo, file, s, a, preparePackagingExample };
}
test("SQLite packaging evidence, summary and immutable versions survive reopening", async (t) => {
  const f = await sqlFixture(t),
    p = await new PackagingRegistry(f.repo).pack(f.s, packBody(f.a));
  const r = new PreviewSqliteRepository(f.file);
  try {
    const registry = new PackagingRegistry(r);
    assert.deepEqual(await registry.get(f.s, p.id), {
      ...p,
      scanIdentifier: `RSP-P-${p.id.toUpperCase()}-V${p.version}`,
    });
    assert.equal((await registry.list(f.s)).items[0].instrumentCount, 1);
    assert.equal(
      "assemblySnapshot" in (await registry.list(f.s)).items[0],
      false,
    );
    await assert.rejects(
      new TrayRegistry(r).transition(f.s, f.a.id, {
        requestId: randomUUID(),
        version: f.a.version,
        action: "disassemble",
        confirmed: true,
        reason: "Demo",
      }),
      (e) => e.code === "PACKAGING_BLOCKED",
    );
    await registry.void(f.s, p.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    });
    assert.equal((await registry.get(f.s, p.id, 1)).state, "packaged");
  } finally {
    r.close();
  }
});
test("SQLite package audit failures roll back reservation and void including retry receipts", async (t) => {
  const f = await sqlFixture(t),
    p = new PackagingRegistry(f.repo),
    broken = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("synthetic audit failure");
            },
          }),
        ),
    },
    body = packBody(f.a);
  await assert.rejects(new PackagingRegistry(broken).pack(f.s, body));
  assert.equal((await p.list(f.s)).items.length, 0);
  const x = await p.pack(f.s, body);
  await assert.rejects(
    new PackagingRegistry(broken).void(f.s, x.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    }),
  );
  assert.equal((await p.get(f.s, x.id)).state, "packaged");
  await assert.rejects(p.get(f.s, x.id, 2), (e) => e.code === "NOT_FOUND");
});
test("separate SQLite connections cannot package the same assembly concurrently", async (t) => {
  const f = await sqlFixture(t),
    r = new PreviewSqliteRepository(f.file);
  try {
    const results = await Promise.allSettled([
      new PackagingRegistry(f.repo).pack(f.s, packBody(f.a)),
      new PackagingRegistry(r).pack(f.s, packBody(f.a, { code: "PACK-OTHER" })),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "PACKAGING_BLOCKED",
    );
  } finally {
    r.close();
  }
});
test("fictional packaging prerequisite setup is idempotent, CSRF-protected and rolls back failed audit", async (t) => {
  const f = await httpFixture(t),
    key = randomUUID();
  assert.equal(
    (
      await f.call(
        "/preview/packaging-example",
        { requestId: key },
        { "x-sterile-csrf": "" },
      )
    ).status,
    403,
  );
  const a = await (
    await f.call("/preview/packaging-example", { requestId: key })
  ).json();
  assert.deepEqual(
    await (
      await f.call("/preview/packaging-example", { requestId: key })
    ).json(),
    a,
  );
  const g = await sqlFixture(t),
    before = await new InstrumentRegistry(g.repo).list(g.s),
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
  await assert.rejects(g.preparePackagingExample(broken, g.s, randomUUID()));
  assert.deepEqual(await new InstrumentRegistry(g.repo).list(g.s), before);
});
