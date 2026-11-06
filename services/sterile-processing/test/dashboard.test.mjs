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
  DashboardRegistry,
  dashboardQueueIds,
  MaintenanceRegistry,
  TrayRegistry,
  PackagingRegistry,
  CycleRegistry,
  ReviewRegistry,
  DistributionRegistry,
  RecallRegistry,
  ReturnRegistry,
  ProcessingRegistry,
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
test("SQLite dashboard counts current scoped pending returns and excludes disposed history", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-dashboard-")),
    file = join(dir, "preview.sqlite"),
    repo = new PreviewSqliteRepository(file);
  t.after(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    reviewer = { ...s, actorId: randomUUID() },
    { prepareReturnScanExample } =
      await import("../dist/development/return-scan-example.js"),
    sample = await prepareReturnScanExample(repo, s, reviewer, randomUUID());
  const r = await new ReturnRegistry(repo).createScanned(s, {
    requestId: randomUUID(),
    code: "RETURN-DASH",
    distributionId: sample.issue.id,
    distributionVersion: sample.issue.version,
    condition: "used",
    location: "Quarantine",
    custodian: "Custodian",
    reference: "Return",
    note: "",
    contentsChecked: true,
    confirmed: true,
    identifier: sample.identifier,
    receivedInstrumentIds: sample.manifest.map((i) => i.id),
  });
  for (let n = 0; n < 18; n++) {
    const i = await new InstrumentRegistry(repo).register(s, {
      requestId: randomUUID(),
      code: "CLEAN-" + n,
      instrumentTypeId: sample.manifest[0].instrumentTypeId,
      serialNumber: "",
    });
    await new ProcessingRegistry(repo).receive(s, {
      requestId: randomUUID(),
      code: "REC-" + n,
      source: "Department",
      custodian: "Custodian",
      condition: "Used",
      discrepancies: "",
      instrumentIds: [i.id],
      confirmed: true,
    });
  }
  const d = new DashboardRegistry(repo);
  let data = await d.get(s, dashboardQueueIds);
  assert.equal(data.queues.find((q) => q.id === "cleaning").total, 18);
  assert.equal(data.queues.find((q) => q.id === "cleaning").items.length, 12);
  assert.equal(data.queues.find((q) => q.id === "returns").total, 1);
  assert.equal(data.queues.find((q) => q.id === "returns").items[0].id, r.id);
  assert.equal(data.queues.find((q) => q.id === "loading").total, 0);
  assert.equal(data.queues.find((q) => q.id === "release").total, 0);
  assert.equal(
    (
      await d.get({ ...s, facilityId: randomUUID() }, dashboardQueueIds)
    ).queues.every((q) => q.total === 0),
    true,
  );
  await new ReturnRegistry(repo).dispose(reviewer, r.id, {
    requestId: randomUUID(),
    version: 1,
    action: "quarantine",
    reason: "Review",
    reference: "Review",
    episodeCode: "",
    confirmed: true,
  });
  data = await d.get(s, dashboardQueueIds);
  assert.equal(data.queues.find((q) => q.id === "returns").total, 0);
});
test("dashboard endpoint is read-only for preview roles and rejects query injection", async (t) => {
  const f = await httpFixture(t);
  for (const role of ["operator", "reviewer", "viewer"]) {
    await f.login(role);
    const r = await f.call(f.base + "/dashboard");
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.queues.length, 8);
    assert.equal(data.limit, 12);
    assert.ok(data.queues.every((q) => q.access === "allowed"));
  }
  assert.equal((await f.call(f.base + "/dashboard?queue=returns")).status, 400);
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) + "/dashboard",
      )
    ).status,
    404,
  );
});
test("dashboard source permissions hide queue totals and never read denied sources", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    server = createServer(),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    calls = [];
  const repository = {
    transaction: async (scope, work) =>
      work({
        dashboardQueue: async (id) => {
          calls.push(id);
          return { total: 0, items: [] };
        },
      }),
  };
  server.on(
    "request",
    createSterileApp({
      repository,
      authenticate: async () => ({
        tenantId: s.tenantId,
        actorId: s.actorId,
        facilityIds: [s.facilityId],
      }),
      authorize: async (scope, cap, permission) =>
        ["dashboard:read", "returns:read"].includes(permission),
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const r = await fetch(
    "http://127.0.0.1:" +
      server.address().port +
      "/api/v1/sterile/facilities/" +
      s.facilityId +
      "/dashboard",
    { headers: { authorization: "Bearer demo" } },
  );
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.deepEqual(calls, ["returns"]);
  assert.ok(
    data.queues
      .filter((q) => q.id !== "returns")
      .every(
        (q) =>
          q.total === null && q.items.length === 0 && q.access === "restricted",
      ),
  );
});
