import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  PerformanceRegistry,
  EquipmentRegistry,
} from "@intrusionshield/sterile-processing";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
import { createSterilePreview } from "../dist/development/preview.js";
import { prepareReviewExample } from "../dist/development/review-example.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
const day = (n) => new Date(n).toISOString().slice(0, 10),
  range = () => ({
    from: day(Date.now() - 86400000),
    to: day(Date.now() + 86400000),
  });
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "performance-http-")),
    file = join(dir, "registry.sqlite"),
    repo = new PreviewSqliteRepository(file),
    server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port,
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
  async function call(path, body) {
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
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  }
  async function login(role) {
    session = await (await call("/preview/session")).json();
    session = await (await call("/preview/login", { role })).json();
    return session;
  }
  await login("operator");
  return {
    repo,
    file,
    call,
    login,
    get session() {
      return session;
    },
    get base() {
      return "/api/v1/sterile/facilities/" + session.facilityId;
    },
  };
}
test("performance report uses scoped persisted workflow records, reads for all preview roles and rejects invalid queries", async (t) => {
  const f = await fixture(t);
  await f.login("reviewer");
  const sample = await f.call("/preview/review-example", {
    requestId: randomUUID(),
  });
  assert.equal(sample.status, 201);
  const window = range(),
    url = f.base + "/performance?from=" + window.from + "&to=" + window.to;
  for (const role of ["operator", "reviewer", "viewer"]) {
    await f.login(role);
    const response = await f.call(url);
    assert.equal(response.status, 200);
    const r = await response.json();
    assert.deepEqual(r.totals, {
      received: 1,
      cleaning: 1,
      inspection: 1,
      assembly: 1,
      packaging: 1,
      cycles: 1,
      release: 0,
      issue: 0,
      returns: 0,
    });
    assert.equal(r.types[0].cycles, 1);
    assert.equal(r.timing.cycle.samples, 1);
    assert.equal(r.daily.length, 2);
    assert.equal(r.groupingTimeZone, "UTC");
    assert.equal(r.equipment[0].link, "legacy_code");
    assert.equal(r.equipment[0].outOfServiceMinutes, null);
    assert.equal(r.backlog.find((q) => q.queue === "release").total, 1);
  }
  for (const suffix of [
    "",
    "?from=2026-02-30&to=2026-03-02",
    "?from=2020-01-01&to=2026-11-01",
    "?from=" + window.from + "&to=" + window.to + "&tenantId=" + randomUUID(),
  ])
    assert.equal((await f.call(f.base + "/performance" + suffix)).status, 400);
  assert.equal(
    (await f.call(url.replace(f.session.facilityId, randomUUID()))).status,
    404,
  );
  assert.equal((await f.call(f.base + "/performance", {})).status, 404);
});
test("SQL equipment status predecessor reconstructs only recorded downtime and reports survive reopen without writes", async (t) => {
  const f = await fixture(t),
    s = {
      tenantId: f.session.tenantId,
      facilityId: f.session.facilityId,
      actorId: f.session.actorId,
    },
    er = new EquipmentRegistry(f.repo);
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-11-01T00:00:00.000Z"),
  });
  const input = {
      requestId: randomUUID(),
      code: "OFFLINE-DEMO",
      name: "Demo",
      kind: "sterilizer",
      methods: ["steam"],
      manufacturer: "DEMO",
      model: "DEMO",
      serialNumber: "DEMO",
      location: "DEMO",
      state: "out_of_service",
      lastServicedAt: "2026-10-31T00:00:00.000Z",
      serviceDueAt: "2026-12-01T00:00:00.000Z",
      serviceReference: "SIMULATED",
      qualificationDueAt: "2027-11-01T00:00:00.000Z",
      qualificationReference: "SIMULATED",
      reason: "SIMULATED",
      confirmed: true,
    },
    machine = await er.register(s, input);
  t.mock.timers.setTime(Date.parse("2026-11-02T01:00:00.000Z"));
  await er.recordService(s, machine.id, {
    requestId: randomUUID(),
    version: 1,
    state: "in_service",
    lastServicedAt: "2026-11-02T00:30:00.000Z",
    serviceDueAt: input.serviceDueAt,
    serviceReference: "SIMULATED-REPAIR",
    qualificationDueAt: input.qualificationDueAt,
    qualificationReference: input.qualificationReference,
    reason: "SIMULATED return",
    confirmed: true,
  });
  t.mock.timers.setTime(Date.parse("2026-11-03T12:00:00.000Z"));
  const from = "2026-11-02",
    to = "2026-11-03",
    r = await new PerformanceRegistry(f.repo).report(s, from, to);
  assert.equal(
    r.equipment.find((e) => e.id === machine.id).outOfServiceMinutes,
    60,
  );
  assert.equal((await er.history(s, machine.id)).items.length, 2);
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const after = await new PerformanceRegistry(reopened).report(s, from, to);
    assert.deepEqual(after.totals, r.totals);
    assert.equal(after.equipment[0].outOfServiceMinutes, 60);
    assert.equal(
      (await new EquipmentRegistry(reopened).history(s, machine.id)).items
        .length,
      2,
    );
    const foreign = await new PerformanceRegistry(reopened).report(
      { ...s, tenantId: randomUUID() },
      from,
      to,
    );
    assert.equal(foreign.equipment.length, 0);
    assert.ok(Object.values(foreign.totals).every((n) => n === 0));
  } finally {
    reopened.close();
  }
});
test("report and every source read permission are enforced before repository access", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    server = createServer();
  let denied = "reports:read",
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
      authenticate: async () => ({
        tenantId: s.tenantId,
        actorId: s.actorId,
        facilityIds: [s.facilityId],
      }),
      authorize: async (scope, cap, permission) => permission !== denied,
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const r = range(),
    url =
      "http://127.0.0.1:" +
      server.address().port +
      "/api/v1/sterile/facilities/" +
      s.facilityId +
      "/performance?from=" +
      r.from +
      "&to=" +
      r.to;
  for (const permission of [
    "reports:read",
    "processing:read",
    "trays:read",
    "packaging:read",
    "cycles:read",
    "release:read",
    "distribution:read",
    "returns:read",
    "equipment:read",
    "instruments:read",
  ]) {
    denied = permission;
    assert.equal(
      (await fetch(url, { headers: { authorization: "Bearer demo" } })).status,
      403,
    );
    assert.equal(queries, 0);
  }
});
