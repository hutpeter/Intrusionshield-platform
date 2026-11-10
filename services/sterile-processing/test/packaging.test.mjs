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
    repo,
    file: join(dir, "registry.sqlite"),
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
async function fundLotHttp(f, lot, quantity = 20) {
  const r = await f.call(f.base + "/consumables/" + lot.id + "/stock/receive", {
    requestId: randomUUID(),
    version: 0,
    quantity,
    reason: "SIMULATED receipt",
    reference: "DELIVERY",
    confirmed: true,
  });
  assert.equal(r.status, 201);
  return r.json();
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
  ...(extra.consumableLotIds
    ? {
        consumableUsage: extra.consumableLotIds.map((lotId) => ({
          lotId,
          quantity: 1,
        })),
      }
    : {}),
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

test("HTTP freezes policy and records protected integrity hold without altering original package history", async (t) => {
  const f = await httpFixture(t),
    a = await example(f);
  const policy = {
    mode: "time_based",
    reference: "SIMULATED-POLICY",
    revision: "DEMO-1",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    warningDays: 7,
  };
  const r = await f.call(
    f.base + "/packages",
    packBody(a, { shelfLife: policy }),
  );
  assert.equal(r.status, 201);
  const p = await r.json();
  assert.deepEqual(p.shelfLife, policy);
  const input = {
      requestId: randomUUID(),
      packageVersion: 1,
      reason: "SIMULATED torn wrap",
      evidence: "SIMULATED-PHOTO",
      location: "DEMO-HOLD",
      confirmed: true,
    },
    path = f.base + "/packages/" + p.id + "/integrity-hold";
  assert.equal(
    (await f.call(path, input, { "x-sterile-csrf": "" })).status,
    403,
  );
  await f.login("viewer");
  assert.equal((await f.call(path, input)).status, 403);
  await f.login("operator");
  assert.equal((await f.call(path, { ...input, extra: true })).status, 400);
  assert.equal(
    (await f.call(path, { ...input, confirmed: false })).status,
    400,
  );
  assert.equal(
    (await f.call(path.replace(f.session.facilityId, randomUUID()), input))
      .status,
    404,
  );
  const saved = await f.call(path, input);
  assert.equal(saved.status, 201);
  const hold = await saved.json();
  assert.deepEqual(await (await f.call(path, input)).json(), hold);
  const current = await (await f.call(f.base + "/packages/" + p.id)).json(),
    past = await (
      await f.call(f.base + "/packages/" + p.id + "/versions/1")
    ).json();
  assert.deepEqual(current.integrityHold, hold);
  assert.equal(current.version, 1);
  assert.equal(current.scanIdentifier, past.scanIdentifier);
  assert.equal(past.integrityHold, undefined);
  const dashboard = await (
    await f.call(f.base + "/dashboard/queues/packageAlerts")
  ).json();
  assert.equal(dashboard.queue.total, 1);
  assert.equal(
    (
      await f.call(f.base + "/loads", {
        requestId: randomUUID(),
        code: "LOAD-HELD",
        sterilizer: "STER-DEMO",
        method: "steam",
        profile: "DEMO",
        profileVersion: "1",
        packageIds: [p.id],
        confirmed: true,
      })
    ).status,
    409,
  );
});

test("HTTP consumable registration, CSRF, roles, strict input and scoped frozen packaging links", async (t) => {
  const f = await httpFixture(t),
    input = {
      requestId: randomUUID(),
      code: "LOT-HTTP",
      kind: "pouch",
      name: "DEMO WRAP",
      lotNumber: "LOT-1",
      supplier: "DEMO",
      supplierReference: "DEMO receipt",
      expiresOn: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      confirmed: true,
    };
  assert.equal(
    (await f.call(f.base + "/consumables", input, { "x-sterile-csrf": "bad" }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call(f.base + "/consumables", {
        ...input,
        tenantId: randomUUID(),
      })
    ).status,
    400,
  );
  let response = await f.call(f.base + "/consumables", input);
  assert.equal(response.status, 201);
  const lot = await response.json();
  assert.equal(
    (await (await f.call(f.base + "/consumables?page=1")).json()).items[0].id,
    lot.id,
  );
  await fundLotHttp(f, lot);
  const a = await example(f);
  response = await f.call(
    f.base + "/packages",
    packBody(a, { consumableLotIds: [lot.id] }),
  );
  assert.equal(response.status, 201);
  const p = await response.json();
  assert.equal(p.consumableLots[0].supplierReference, input.supplierReference);
  assert.equal(
    (
      await (
        await f.call(f.base + "/consumables/" + lot.id + "/packages")
      ).json()
    ).items[0].id,
    p.id,
  );
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const { ConsumableRegistry } =
        await import("@intrusionshield/sterile-processing"),
      registry = new ConsumableRegistry(reopened);
    assert.equal(
      (await registry.detail(f.session, lot.id)).supplierReference,
      input.supplierReference,
    );
    assert.equal(
      (await registry.packages(f.session, lot.id)).items[0].id,
      p.id,
    );
  } finally {
    reopened.close();
  }

  assert.equal(
    (await (await f.call(f.base + "/packages/" + p.id + "/versions/1")).json())
      .consumableLots[0].id,
    lot.id,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/consumables/" +
          lot.id,
      )
    ).status,
    404,
  );
  for (const role of ["viewer", "reviewer"]) {
    await f.login(role);
    assert.equal((await f.call(f.base + "/consumables")).status, 200);
    assert.equal(
      (
        await f.call(f.base + "/consumables", {
          ...input,
          requestId: randomUUID(),
          code: role,
        })
      ).status,
      403,
    );
  }
});

test("consumable and package-use source permissions are checked before repository access", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    server = createServer();
  let denied = "consumables:read",
    queries = 0;
  server.on(
    "request",
    createSterileApp({
      repository: {
        transaction: async () => {
          queries++;
          throw Error("must not query");
        },
      },
      authenticate: async () => ({ ...s, facilityIds: [s.facilityId] }),
      authorize: async (scope, cap, p) => p !== denied,
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/v1/sterile/facilities/" +
    s.facilityId;
  for (const p of ["consumables:read", "packaging:read"]) {
    denied = p;
    assert.equal(
      (
        await fetch(root + "/consumables/" + randomUUID() + "/packages", {
          headers: { authorization: "Bearer demo" },
        })
      ).status,
      403,
    );
    assert.equal(queries, 0);
  }
  denied = "consumables:write";
  assert.equal(
    (
      await fetch(root + "/consumables", {
        method: "POST",
        headers: {
          authorization: "Bearer demo",
          "content-type": "application/json",
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(queries, 0);
});

test("reviewer lot withdrawal is scoped and persistent; separate linked recall retains lot provenance and package blocks", async (t) => {
  const f = await httpFixture(t),
    input = {
      requestId: randomUUID(),
      code: "WITHDRAW-LOT",
      kind: "wrap",
      name: "DEMO WRAP",
      lotNumber: "LOT-1",
      supplier: "DEMO",
      supplierReference: "DELIVERY",
      expiresOn: "2099-01-01",
      confirmed: true,
    };
  const lot = await (await f.call(f.base + "/consumables", input)).json(),
    receipt = await fundLotHttp(f, lot),
    a = await example(f),
    p = await (
      await f.call(
        f.base + "/packages",
        packBody(a, { consumableLotIds: [lot.id] }),
      )
    ).json(),
    decision = {
      requestId: randomUUID(),
      version: 1,
      reason: "SIMULATED supplier defect",
      reference: "SUPPLIER-NOTICE",
      confirmed: true,
    },
    path = f.base + "/consumables/" + lot.id;
  for (const role of ["operator", "viewer"]) {
    await f.login(role);
    assert.equal((await f.call(path + "/withdraw", decision)).status, 403);
  }
  await f.login("reviewer");
  assert.equal(
    (await f.call(path + "/withdraw", decision, { "x-sterile-csrf": "bad" }))
      .status,
    403,
  );
  assert.equal(
    (await f.call(path + "/withdraw", { ...decision, extra: true })).status,
    400,
  );
  const response = await f.call(path + "/withdraw", decision);
  assert.equal(response.status, 200);
  const withdrawn = await response.json();
  assert.equal(withdrawn.version, 2);
  assert.deepEqual(
    await (await f.call(path + "/withdraw", decision)).json(),
    withdrawn,
  );
  assert.equal(
    (await (await f.call(f.base + "/packages/" + p.id)).json()).recall,
    undefined,
  );
  const impact = await (
    await f.call(path + "/recall-impact?packageId=" + p.id)
  ).json();
  assert.equal(impact.items.length, 1);
  const body = {
    ...decision,
    requestId: randomUUID(),
    version: 2,
    packageId: p.id,
    impactHash: impact.impactHash,
    code: "LOT-HTTP-RECALL",
  };
  assert.equal(
    (await f.call(path + "/recalls", { ...body, confirmed: false })).status,
    400,
  );
  assert.equal(
    (await f.call(path + "/recalls", { ...body, impactHash: "a".repeat(64) }))
      .status,
    409,
  );
  const savedResponse = await f.call(path + "/recalls", body);
  assert.equal(savedResponse.status, 201);
  const saved = await savedResponse.json();
  assert.equal(saved.recalls.length, 1);
  const recall = await (
    await f.call(f.base + "/recalls/" + saved.recalls[0].id)
  ).json();
  assert.equal(recall.consumableLot.id, lot.id);
  assert.equal(
    (await (await f.call(f.base + "/packages/" + p.id)).json()).recall.caseId,
    recall.id,
  );
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const { ConsumableRegistry, PackagingRegistry } =
      await import("@intrusionshield/sterile-processing");
    assert.equal(
      (await new ConsumableRegistry(reopened).detail(f.session, lot.id))
        .withdrawal.reference,
      decision.reference,
    );
    assert.equal(
      (await new PackagingRegistry(reopened).get(f.session, p.id)).recall
        .caseId,
      recall.id,
    );
  } finally {
    reopened.close();
  }
  await f.login("operator");
  const next = await example(f);
  assert.equal(
    (
      await f.call(
        f.base + "/packages",
        packBody(next, {
          code: "BLOCKED-LOT-PACK",
          consumableLotIds: [lot.id],
        }),
      )
    ).status,
    409,
  );
});
test("lot recall source permissions are denied before any repository transaction", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    server = createServer();
  let denied = "recall:read",
    queries = 0;
  server.on(
    "request",
    createSterileApp({
      repository: {
        transaction: async () => {
          queries++;
          throw Error("must not query");
        },
      },
      authenticate: async () => ({ ...s, facilityIds: [s.facilityId] }),
      authorize: async (sc, cap, p) => p !== denied,
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const path =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/v1/sterile/facilities/" +
    s.facilityId +
    "/consumables/" +
    randomUUID();
  for (const permission of [
    "consumables:read",
    "packaging:read",
    "recall:read",
  ]) {
    denied = permission;
    assert.equal(
      (
        await fetch(path + "/recall-impact?packageId=" + randomUUID(), {
          headers: { authorization: "Bearer demo" },
        })
      ).status,
      403,
    );
    assert.equal(queries, 0);
  }
  for (const permission of [
    "consumables:withdraw",
    "packaging:read",
    "recall:write",
  ]) {
    denied = permission;
    assert.equal(
      (
        await fetch(path + "/recalls", {
          method: "POST",
          headers: {
            authorization: "Bearer demo",
            "content-type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(queries, 0);
  }
});

test("stock example starts with no stock; receipts, roles, CSRF, strict fields and ledger survive reopening", async (t) => {
  const f = await httpFixture(t),
    requestId = randomUUID(),
    sample = await f.call("/preview/consumable-stock-example", { requestId });
  assert.equal(sample.status, 201);
  const lot = await sample.json(),
    path = f.base + "/consumables/" + lot.id + "/stock",
    input = {
      requestId: randomUUID(),
      version: 0,
      quantity: 10,
      reason: "SIMULATED receipt",
      reference: "DELIVERY",
      confirmed: true,
    };
  assert.equal((await (await f.call(path)).json()).balance, null);
  assert.equal(
    (await f.call(path + "/receive", input, { "x-sterile-csrf": "bad" }))
      .status,
    403,
  );
  assert.equal(
    (await f.call(path + "/receive", { ...input, available: 999 })).status,
    400,
  );
  assert.equal(
    (await f.call(path + "/receive", { ...input, quantity: 0.5 })).status,
    400,
  );
  const receipt = await f.call(path + "/receive", input);
  assert.equal(receipt.status, 201);
  assert.equal((await receipt.json()).balance.available, 10);
  assert.equal(
    (await (await f.call(path + "/receive", input)).json()).balance.available,
    10,
  );
  assert.equal(
    (
      await f.call(path + "/quarantine", {
        ...input,
        requestId: randomUUID(),
        version: 1,
        quantity: 3,
      })
    ).status,
    403,
  );
  await f.login("reviewer");
  assert.equal(
    (
      await f.call(path + "/receive", {
        ...input,
        requestId: randomUUID(),
        version: 1,
      })
    ).status,
    403,
  );
  let r = await f.call(path + "/quarantine", {
    ...input,
    requestId: randomUUID(),
    version: 1,
    quantity: 3,
  });
  assert.equal(r.status, 201);
  r = await f.call(path + "/discard_quarantined", {
    ...input,
    requestId: randomUUID(),
    version: 2,
    quantity: 2,
  });
  assert.equal(r.status, 201);
  const report = await (await f.call(path)).json();
  assert.equal(report.balance.available, 7);
  assert.equal(report.balance.quarantined, 1);
  assert.equal(report.balance.discarded, 2);
  assert.equal(report.movements.items.length, 3);
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const { ConsumableStockRegistry } =
      await import("@intrusionshield/sterile-processing");
    assert.deepEqual(
      (await new ConsumableStockRegistry(reopened).report(f.session, lot.id))
        .balance,
      report.balance,
    );
  } finally {
    reopened.close();
  }
  await f.login("viewer");
  assert.equal((await f.call(path)).status, 200);
  assert.equal(
    (await f.call(path + "/discard", { ...input, version: 3, quantity: 1 }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/consumables/" +
          lot.id +
          "/stock",
      )
    ).status,
    404,
  );
});
test("competing SQLite package saves cannot overspend the same lot and package/stock audit failure rolls back both", async (t) => {
  const f = await httpFixture(t),
    lot = await (
      await f.call("/preview/consumable-stock-example", {
        requestId: randomUUID(),
      })
    ).json(),
    a = await example(f),
    b = await example(f);
  await fundLotHttp(f, lot, 5);
  const other = new PreviewSqliteRepository(f.file);
  try {
    const stockBody = (a, code) =>
      packBody(a, {
        code,
        material: lot.name,
        materialLot: lot.lotNumber,
        consumableLotIds: [lot.id],
        consumableUsage: [{ lotId: lot.id, quantity: 3 }],
      });
    const results = await Promise.allSettled([
      new PackagingRegistry(f.repo).pack(
        f.session,
        stockBody(a, "STOCK-RACE-A"),
      ),
      new PackagingRegistry(other).pack(
        f.session,
        stockBody(b, "STOCK-RACE-B"),
      ),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "INSUFFICIENT_STOCK",
    );
    const { ConsumableStockRegistry } =
      await import("@intrusionshield/sterile-processing");
    const report = await new ConsumableStockRegistry(other).report(
      f.session,
      lot.id,
    );
    assert.equal(report.balance.available, 2);
    assert.equal(report.balance.used, 3);
    assert.equal(report.movements.items.length, 2);
    const used = report.movements.items[0];
    assert.ok(used.packageId);
    assert.equal(
      (await new PackagingRegistry(other).get(f.session, used.packageId))
        .consumableUsage[0].movementId,
      used.id,
    );
  } finally {
    other.close();
  }
});

test("SQLite failure in package audit rolls back prior stock audits, balances, ledger and retry receipt", async (t) => {
  const f = await httpFixture(t),
    lot = await (
      await f.call("/preview/consumable-stock-example", {
        requestId: randomUUID(),
      })
    ).json(),
    a = await example(f);
  await fundLotHttp(f, lot, 4);
  const broken = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async (event) => {
              if (event.action === "package-created")
                throw Error("synthetic package audit failure");
              return tx.appendAudit(event);
            },
          }),
        ),
    },
    input = packBody(a, {
      material: lot.name,
      materialLot: lot.lotNumber,
      consumableLotIds: [lot.id],
      consumableUsage: [{ lotId: lot.id, quantity: 2 }],
    });
  await assert.rejects(new PackagingRegistry(broken).pack(f.session, input));
  const { ConsumableStockRegistry } =
      await import("@intrusionshield/sterile-processing"),
    r = new ConsumableStockRegistry(f.repo);
  assert.equal((await r.report(f.session, lot.id)).balance.available, 4);
  assert.equal((await r.report(f.session, lot.id)).movements.items.length, 1);
  const p = await new PackagingRegistry(f.repo).pack(f.session, input);
  assert.equal(p.consumableUsage[0].quantity, 2);
  assert.equal((await r.report(f.session, lot.id)).balance.available, 2);
});

test("stock alert settings require reviewer confirmation and CSRF; SQL dashboard derives live scoped values across stock changes", async (t) => {
  const f = await httpFixture(t),
    requestId = randomUUID();
  assert.equal(
    (await f.call("/preview/consumable-alert-example", { requestId })).status,
    403,
  );
  await f.login("reviewer");
  let response = await f.call("/preview/consumable-alert-example", {
    requestId,
  });
  assert.equal(response.status, 201);
  const lot = await response.json(),
    path = f.base + "/consumables/" + lot.id + "/alert-policy",
    input = {
      requestId: randomUUID(),
      version: 1,
      minimumStock: 10,
      warningDays: 7,
      reason: "SIMULATED review",
      reference: "POLICY",
      confirmed: true,
    };
  assert.equal(
    (await f.call(path, input, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  assert.equal(
    (await f.call(path, { ...input, confirmed: false })).status,
    400,
  );
  assert.equal((await f.call(path, { ...input, extra: true })).status, 400);
  response = await f.call(path, input);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.version, 2);
  assert.deepEqual(await (await f.call(path, input)).json(), saved);
  let q = await (
    await f.call(f.base + "/dashboard/queues/consumableAlerts")
  ).json();
  let item = q.queue.items.find((x) => x.id === lot.id);
  assert.equal(q.queue.workspace, "consumables");
  assert.equal(item.consumableAlert.available, 5);
  assert.equal(item.consumableAlert.lowStock, true);
  assert.equal(item.consumableAlert.expiry, "expiring");
  await f.login("operator");
  assert.equal(
    (await f.call(path, { ...input, requestId: randomUUID(), version: 2 }))
      .status,
    403,
  );
  await f.call(f.base + "/consumables/" + lot.id + "/stock/receive", {
    requestId: randomUUID(),
    version: 1,
    quantity: 6,
    reason: "SIMULATED replenishment",
    reference: "DELIVERY",
    confirmed: true,
  });
  q = await (
    await f.call(f.base + "/dashboard/queues/consumableAlerts")
  ).json();
  item = q.queue.items.find((x) => x.id === lot.id);
  assert.equal(item.consumableAlert.available, 11);
  assert.equal(item.consumableAlert.lowStock, false);
  assert.equal(item.consumableAlert.expiry, "expiring");
  await f.login("reviewer");
  assert.equal(
    (
      await f.call(f.base + "/consumables/" + lot.id + "/withdraw", {
        requestId: randomUUID(),
        version: 2,
        reason: "SIMULATED withdrawal",
        reference: "NOTICE",
        confirmed: true,
      })
    ).status,
    200,
  );
  q = await (
    await f.call(f.base + "/dashboard/queues/consumableAlerts")
  ).json();
  assert.equal(
    q.queue.items.some((x) => x.id === lot.id),
    false,
  );
});
test("consumable alert queue pages cover all matching lots in stable order and exclude foreign scope, positive far-future stock and withdrawn lots", async (t) => {
  const f = await httpFixture(t),
    {
      ConsumableRegistry,
      ConsumableAlertRegistry,
      ConsumableStockRegistry,
      DashboardRegistry,
      consumableAlert,
    } = await import("@intrusionshield/sterile-processing"),
    lots = new ConsumableRegistry(f.repo),
    policies = new ConsumableAlertRegistry(f.repo),
    stock = new ConsumableStockRegistry(f.repo);
  for (let n = 0; n < 15; n++) {
    const lot = await lots.register(f.session, {
      requestId: randomUUID(),
      code: "LOW-" + String(n).padStart(2, "0"),
      kind: "wrap",
      name: "SIMULATED",
      lotNumber: "LOT",
      supplier: "DEMO",
      supplierReference: "REF",
      expiresOn: "2099-01-01",
      confirmed: true,
    });
    await policies.configure(f.session, lot.id, {
      requestId: randomUUID(),
      version: 1,
      minimumStock: 0,
      warningDays: 7,
      reason: "SIMULATED zero-stock",
      reference: "POLICY",
      confirmed: true,
    });
  }
  const registry = new DashboardRegistry(f.repo),
    a = await registry.queue(f.session, "consumableAlerts", 1),
    b = await registry.queue(f.session, "consumableAlerts", 2);
  assert.equal(a.queue.total, 15);
  assert.equal(a.queue.items.length, 12);
  assert.equal(b.queue.items.length, 3);
  assert.equal(
    new Set([...a.queue.items, ...b.queue.items].map((x) => x.id)).size,
    15,
  );
  assert.equal(
    (
      await registry.queue(
        { ...f.session, facilityId: randomUUID() },
        "consumableAlerts",
      )
    ).queue.total,
    0,
  );
  for (const x of [...a.queue.items, ...b.queue.items]) {
    assert.equal(x.consumableAlert.lowStock, true);
    assert.equal(x.consumableAlert.stockRecorded, false);
  }
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const page = await new DashboardRegistry(reopened).queue(
      f.session,
      "consumableAlerts",
    );
    assert.deepEqual(page.queue.items, a.queue.items);
  } finally {
    reopened.close();
  }
});

test("SQL consumable expiry alerts include the seventh warning day and expired positive balances but not an eighth day or zero balance", async (t) => {
  const f = await httpFixture(t),
    { ConsumableRegistry, ConsumableStockRegistry, DashboardRegistry } =
      await import("@intrusionshield/sterile-processing"),
    lots = new ConsumableRegistry(f.repo),
    stock = new ConsumableStockRegistry(f.repo),
    day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10),
    ids = {};
  for (const [name, days, quantity] of [
    ["SEVEN", 7, 1],
    ["EIGHT", 8, 1],
    ["EXPIRED", -1, 1],
    ["EMPTY", -1, 0],
  ]) {
    const lot = await lots.register(f.session, {
      requestId: randomUUID(),
      code: "EXPIRY-" + name,
      kind: "pouch",
      name: "SIMULATED",
      lotNumber: "LOT",
      supplier: "DEMO",
      supplierReference: "REF",
      expiresOn: day(days),
      confirmed: true,
    });
    ids[name] = lot.id;
    if (quantity)
      await stock.record(f.session, lot.id, "receive", {
        requestId: randomUUID(),
        version: 0,
        quantity,
        reason: "SIMULATED",
        reference: "REF",
        confirmed: true,
      });
  }
  const q = (
    await new DashboardRegistry(f.repo).queue(f.session, "consumableAlerts")
  ).queue;
  assert.equal(q.total, 2);
  assert.equal(
    q.items.find((x) => x.id === ids.SEVEN).consumableAlert.expiry,
    "expiring",
  );
  assert.equal(
    q.items.find((x) => x.id === ids.EXPIRED).consumableAlert.expiry,
    "expired",
  );
  assert.equal(
    q.items.some((x) => x.id === ids.EIGHT || x.id === ids.EMPTY),
    false,
  );
});

test("operator counts await reviewer approval; strict fields, CSRF and scoped decisions preserve original receipt history", async (t) => {
  const f = await httpFixture(t),
    lot = await (
      await f.call("/preview/consumable-stock-example", {
        requestId: randomUUID(),
      })
    ).json();
  await fundLotHttp(f, lot, 10);
  const path = f.base + "/consumables/" + lot.id + "/stock/counts",
    input = {
      requestId: randomUUID(),
      stockVersion: 1,
      countedAvailable: 8,
      reason: "SIMULATED physical count",
      reference: "COUNT-EVIDENCE",
      confirmed: true,
    };
  assert.equal((await f.call(path, { ...input, difference: 999 })).status, 400);
  assert.equal(
    (await f.call(path, input, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  let response = await f.call(path, input);
  assert.equal(response.status, 201);
  const count = await response.json();
  assert.equal(count.difference, -2);
  assert.deepEqual(await (await f.call(path, input)).json(), count);
  assert.equal(
    (await (await f.call(f.base + "/consumables/" + lot.id + "/stock")).json())
      .balance.available,
    10,
  );
  const decision = {
    requestId: randomUUID(),
    version: 1,
    reason: "SIMULATED approved",
    reference: "REVIEW-EVIDENCE",
    confirmed: true,
  };
  assert.equal(
    (await f.call(path + "/" + count.id + "/approve", decision)).status,
    403,
  );
  await f.login("viewer");
  assert.equal((await f.call(path)).status, 200);
  assert.equal(
    (await f.call(path, { ...input, requestId: randomUUID() })).status,
    403,
  );
  await f.login("reviewer");
  assert.equal(
    (await f.call(path, { ...input, requestId: randomUUID() })).status,
    403,
  );
  assert.equal(
    (
      await f.call(path + "/" + count.id + "/approve", {
        ...decision,
        confirmed: false,
      })
    ).status,
    400,
  );
  response = await f.call(path + "/" + count.id + "/approve", decision);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "approved");
  const report = await (
    await f.call(f.base + "/consumables/" + lot.id + "/stock")
  ).json();
  assert.equal(report.balance.available, 8);
  assert.equal(report.balance.received, 10);
  assert.equal(report.balance.adjustments, -2);
  assert.equal(report.movements.items[0].stockCountId, count.id);
  assert.equal(report.movements.items.at(-1).balance.available, 10);
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const { StockReconciliationRegistry, ConsumableStockRegistry } =
      await import("@intrusionshield/sterile-processing");
    assert.equal(
      (await new StockReconciliationRegistry(reopened).list(f.session, lot.id))
        .items[0].state,
      "approved",
    );
    assert.equal(
      (await new ConsumableStockRegistry(reopened).report(f.session, lot.id))
        .balance.available,
      8,
    );
  } finally {
    reopened.close();
  }
});
test("SQL count approval audit failure rolls back adjustment ledger and count state together", async (t) => {
  const f = await httpFixture(t),
    { StockReconciliationRegistry, ConsumableStockRegistry } =
      await import("@intrusionshield/sterile-processing"),
    lot = await (
      await f.call("/preview/consumable-stock-example", {
        requestId: randomUUID(),
      })
    ).json();
  await fundLotHttp(f, lot, 10);
  const r = new StockReconciliationRegistry(f.repo),
    count = await r.record(f.session, lot.id, {
      requestId: randomUUID(),
      stockVersion: 1,
      countedAvailable: 7,
      reason: "COUNT",
      reference: "EVIDENCE",
      confirmed: true,
    }),
    reviewer = { ...f.session, actorId: randomUUID() },
    decision = {
      requestId: randomUUID(),
      version: 1,
      reason: "REVIEW",
      reference: "EVIDENCE",
      confirmed: true,
    },
    broken = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async (e) => {
              if (e.action === "stock-count-decided")
                throw Error("synthetic count audit failure");
              return tx.appendAudit(e);
            },
          }),
        ),
    };
  await assert.rejects(
    new StockReconciliationRegistry(broken).decide(
      reviewer,
      lot.id,
      count.id,
      "approve",
      decision,
    ),
  );
  assert.equal(
    (await new ConsumableStockRegistry(f.repo).report(f.session, lot.id))
      .balance.available,
    10,
  );
  assert.equal(
    (await new ConsumableStockRegistry(f.repo).report(f.session, lot.id))
      .movements.items.length,
    1,
  );
  assert.equal((await r.list(f.session, lot.id)).items[0].state, "pending");
  await r.decide(reviewer, lot.id, count.id, "approve", decision);
  assert.equal(
    (await new ConsumableStockRegistry(f.repo).report(f.session, lot.id))
      .balance.available,
    7,
  );
});
test("fictional reconciliation helper creates pending count without adjustment; stale approvals require rejection and recount", async (t) => {
  const f = await httpFixture(t),
    requestId = randomUUID();
  assert.equal(
    (await f.call("/preview/stock-count-example", { requestId })).status,
    403,
  );
  await f.login("reviewer");
  let response = await f.call("/preview/stock-count-example", { requestId });
  assert.equal(response.status, 201);
  const lot = await response.json();
  assert.equal(
    (await (await f.call("/preview/stock-count-example", { requestId })).json())
      .id,
    lot.id,
  );
  const path = f.base + "/consumables/" + lot.id + "/stock",
    count = (await (await f.call(path + "/counts")).json()).items[0];
  assert.equal(count.state, "pending");
  assert.equal(count.countedAvailable, 8);
  assert.equal((await (await f.call(path)).json()).balance.available, 10);
  await f.login("operator");
  await f.call(path + "/receive", {
    requestId: randomUUID(),
    version: 1,
    quantity: 2,
    reason: "DELIVERY",
    reference: "REF",
    confirmed: true,
  });
  await f.login("reviewer");
  const decision = {
    requestId: randomUUID(),
    version: 1,
    reason: "REVIEW",
    reference: "EVIDENCE",
    confirmed: true,
  };
  assert.equal(
    (await f.call(path + "/counts/" + count.id + "/approve", decision)).status,
    409,
  );
  assert.equal(
    (
      await f.call(path + "/counts/" + count.id + "/reject", {
        ...decision,
        requestId: randomUUID(),
      })
    ).status,
    200,
  );
  assert.equal((await (await f.call(path)).json()).balance.available, 12);
});

test("two SQLite reviewers approve a pending count at most once", async (t) => {
  const f = await httpFixture(t),
    { StockReconciliationRegistry, ConsumableStockRegistry } =
      await import("@intrusionshield/sterile-processing"),
    lot = await (
      await f.call("/preview/consumable-stock-example", {
        requestId: randomUUID(),
      })
    ).json();
  await fundLotHttp(f, lot, 10);
  const count = await new StockReconciliationRegistry(f.repo).record(
      f.session,
      lot.id,
      {
        requestId: randomUUID(),
        stockVersion: 1,
        countedAvailable: 8,
        reason: "COUNT",
        reference: "REF",
        confirmed: true,
      },
    ),
    other = new PreviewSqliteRepository(f.file),
    reviewer = { ...f.session, actorId: randomUUID() },
    input = () => ({
      requestId: randomUUID(),
      version: 1,
      reason: "REVIEW",
      reference: "REF",
      confirmed: true,
    });
  try {
    const outcomes = await Promise.allSettled([
      new StockReconciliationRegistry(f.repo).decide(
        reviewer,
        lot.id,
        count.id,
        "approve",
        input(),
      ),
      new StockReconciliationRegistry(other).decide(
        { ...reviewer, actorId: randomUUID() },
        lot.id,
        count.id,
        "approve",
        input(),
      ),
    ]);
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      outcomes.find((x) => x.status === "rejected").reason.code,
      "CONFLICT",
    );
    const report = await new ConsumableStockRegistry(other).report(
      f.session,
      lot.id,
    );
    assert.equal(report.balance.available, 8);
    assert.equal(report.balance.adjustments, -2);
    assert.equal(report.movements.items.length, 2);
  } finally {
    other.close();
  }
});

test("review queue preserves exact count targets, detects stale snapshots and hides reviewer totals", async (t) => {
  const f = await httpFixture(t),
    requestId = randomUUID();
  assert.equal(
    (await f.call("/preview/review-queue-example", { requestId })).status,
    403,
  );
  await f.login("reviewer");
  const response = await f.call("/preview/review-queue-example", { requestId });
  assert.equal(response.status, 201);
  const fixture = await response.json();
  assert.deepEqual(
    await (await f.call("/preview/review-queue-example", { requestId })).json(),
    fixture,
  );
  const queuePath = f.base + "/dashboard/queues/stockCountReviews";
  let queue = (await (await f.call(queuePath)).json()).queue;
  assert.equal(queue.total, 2);
  for (const [name, current, stale] of [
    ["ready", 10, false],
    ["stale", 12, true],
  ]) {
    const count = fixture[name];
    const row = queue.items.find((x) => x.id === count.id);
    assert.equal(row.stockCountReview.lotId, count.lotId);
    assert.equal(row.stockCountReview.countId, count.id);
    assert.equal(row.stockCountReview.currentAvailable, current);
    assert.equal(row.stockCountReview.recordedAvailable, 10);
    assert.equal(row.stockCountReview.countedAvailable, 8);
    assert.equal(row.stockCountReview.difference, -2);
    assert.equal(row.stockCountReview.stale, stale);
    const path =
      f.base + "/consumables/" + count.lotId + "/stock/counts/" + count.id;
    assert.deepEqual(await (await f.call(path)).json(), count);
  }
  const ready = fixture.ready,
    stale = fixture.stale;
  assert.equal(
    (
      await f.call(
        f.base + "/consumables/" + stale.lotId + "/stock/counts/" + ready.id,
      )
    ).status,
    404,
  );
  const decide = (count, action) =>
    f.call(
      f.base +
        "/consumables/" +
        count.lotId +
        "/stock/counts/" +
        count.id +
        "/" +
        action,
      {
        requestId: randomUUID(),
        version: 1,
        reason: "REVIEW",
        reference: "EVIDENCE",
        confirmed: true,
      },
    );
  assert.equal((await decide(stale, "approve")).status, 409);
  assert.equal((await decide(ready, "approve")).status, 200);
  queue = (await (await f.call(queuePath)).json()).queue;
  assert.equal(queue.total, 1);
  assert.equal(queue.items[0].id, stale.id);
  assert.equal(
    (
      await (
        await f.call(
          f.base + "/consumables/" + ready.lotId + "/stock/counts/" + ready.id,
        )
      ).json()
    ).state,
    "approved",
  );
  assert.equal((await decide(stale, "reject")).status, 200);
  assert.equal((await (await f.call(queuePath)).json()).queue.total, 0);
  assert.equal(
    (
      await (
        await f.call(f.base + "/consumables/" + stale.lotId + "/stock")
      ).json()
    ).balance.available,
    12,
  );
  for (const role of ["operator", "viewer"]) {
    await f.login(role);
    assert.equal((await f.call(queuePath)).status, 403);
    const hidden = (
      await (await f.call(f.base + "/dashboard")).json()
    ).queues.find((q) => q.id === "stockCountReviews");
    assert.equal(hidden.access, "restricted");
    assert.equal(hidden.total, null);
    assert.deepEqual(hidden.items, []);
  }
});

test("review queue paging is stable, scoped and read-only across SQLite reopen", async (t) => {
  const f = await httpFixture(t);
  const { prepareReviewQueueExample } =
    await import("../dist/development/review-queue-example.js");
  const { DashboardRegistry } =
    await import("@intrusionshield/sterile-processing");
  for (let i = 0; i < 7; i++)
    await prepareReviewQueueExample(f.repo, f.session, randomUUID());
  const d = new DashboardRegistry(f.repo),
    a = (await d.queue(f.session, "stockCountReviews", 1)).queue,
    b = (await d.queue(f.session, "stockCountReviews", 2)).queue;
  assert.equal(a.total, 14);
  assert.equal(a.items.length, 12);
  assert.equal(b.items.length, 2);
  assert.equal(new Set([...a.items, ...b.items].map((x) => x.id)).size, 14);
  assert.equal(
    [...a.items, ...b.items].filter((x) => x.stockCountReview.stale).length,
    7,
  );
  assert.deepEqual((await d.queue(f.session, "stockCountReviews", 1)).queue, a);
  assert.equal(
    (
      await d.queue(
        { ...f.session, facilityId: randomUUID() },
        "stockCountReviews",
        1,
      )
    ).queue.total,
    0,
  );
  const reopened = new PreviewSqliteRepository(f.file);
  t.after(() => reopened.close());
  assert.deepEqual(
    (
      await new DashboardRegistry(reopened).queue(
        f.session,
        "stockCountReviews",
        1,
      )
    ).queue,
    a,
  );
});
