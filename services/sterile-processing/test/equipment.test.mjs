import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  EquipmentRegistry,
  ProcessingRegistry,
} from "@intrusionshield/sterile-processing";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
import { createSterilePreview } from "../dist/development/preview.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
const equipmentBody = (extra = {}) => ({
  requestId: randomUUID(),
  code: "MACHINE-DEMO",
  name: "Demo machine",
  kind: "sterilizer",
  methods: ["steam"],
  manufacturer: "DEMO",
  model: "DEMO",
  serialNumber: "DEMO",
  location: "DEMO-AREA",
  state: "in_service",
  lastServicedAt: new Date(Date.now() - 86400000).toISOString(),
  serviceDueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  serviceReference: "SIMULATED-SERVICE",
  qualificationDueAt: new Date(Date.now() + 365 * 86400000).toISOString(),
  qualificationReference: "SIMULATED-QUALIFICATION",
  reason: "Fictional equipment setup",
  confirmed: true,
  ...extra,
});
async function fixture(t) {
  const file = join(
      mkdtempSync(join(tmpdir(), "equipment-test-")),
      "registry.sqlite",
    ),
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
          rmSync(file.slice(0, file.lastIndexOf("/")), {
            recursive: true,
            force: true,
          });
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
  async function login(role) {
    session = await (await call("/preview/session")).json();
    session = await (await call("/preview/login", { role })).json();
    return session;
  }
  await login("reviewer");
  return {
    call,
    login,
    repo,
    file,
    get session() {
      return session;
    },
    get base() {
      return "/api/v1/sterile/facilities/" + session.facilityId;
    },
  };
}
test("equipment API enforces reviewer service authorization, operator hold, CSRF, scope and strict fields", async (t) => {
  const f = await fixture(t),
    body = equipmentBody();
  assert.equal(
    (await f.call(f.base + "/equipment", body, { "x-sterile-csrf": "" }))
      .status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/equipment", { ...body, extra: true })).status,
    400,
  );
  const r = await f.call(f.base + "/equipment", body);
  assert.equal(r.status, 201);
  const machine = await r.json();
  const service = {
    requestId: randomUUID(),
    version: 1,
    state: "in_service",
    lastServicedAt: machine.lastServicedAt,
    serviceDueAt: machine.serviceDueAt,
    serviceReference: machine.serviceReference,
    qualificationDueAt: machine.qualificationDueAt,
    qualificationReference: machine.qualificationReference,
    reason: "SIMULATED return",
    confirmed: true,
  };
  await f.login("operator");
  assert.equal(
    (await f.call(f.base + "/equipment/" + machine.id + "/service", service))
      .status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/equipment", equipmentBody({ code: "OTHER" })))
      .status,
    403,
  );
  const held = await f.call(f.base + "/equipment/" + machine.id + "/hold", {
    requestId: randomUUID(),
    version: 1,
    reason: "SIMULATED defect",
    confirmed: true,
  });
  assert.equal(held.status, 200);
  assert.equal((await held.json()).state, "out_of_service");
  await f.login("viewer");
  assert.equal((await f.call(f.base + "/equipment/" + machine.id)).status, 200);
  assert.equal(
    (
      await f.call(f.base + "/equipment/" + machine.id + "/hold", {
        requestId: randomUUID(),
        version: 2,
        reason: "DEMO",
        confirmed: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/equipment/" +
          machine.id,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await (
        await f.call(f.base + "/equipment/" + machine.id + "/versions/1")
      ).json()
    ).state,
    "in_service",
  );
  await f.login("reviewer");
  assert.equal(
    (
      await f.call(f.base + "/equipment/" + machine.id + "/service", {
        ...service,
        requestId: randomUUID(),
        version: 2,
      })
    ).status,
    200,
  );
});
test("SQLite equipment and frozen cleaning machine survive reopening; late audit failure cannot activate a machine", async (t) => {
  const f = await fixture(t),
    s = {
      tenantId: f.session.tenantId,
      facilityId: f.session.facilityId,
      actorId: f.session.actorId,
    },
    er = new EquipmentRegistry(f.repo),
    input = equipmentBody({ kind: "washer_disinfector", methods: [] }),
    machine = await er.register(s, input);
  const failing = new EquipmentRegistry({
    transaction: (scope, work) =>
      f.repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw Error("late audit");
          },
        }),
      ),
  });
  await assert.rejects(
    failing.hold(s, machine.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "SIMULATED",
      confirmed: true,
    }),
  );
  assert.equal((await er.get(s, machine.id)).version, 1);
  await f.login("operator");
  const instrument = await (
    await f.call("/preview/receiving-scan-example", { requestId: randomUUID() })
  ).json();
  const received = await (
    await f.call(f.base + "/processing", {
      requestId: randomUUID(),
      code: "REC-EQUIPMENT",
      source: "DEMO",
      custodian: "DEMO",
      condition: "DEMO",
      discrepancies: "",
      instrumentIds: [instrument.id],
      confirmed: true,
    })
  ).json();
  const started = await f.call(
    f.base + "/processing/" + received.id + "/start",
    {
      requestId: randomUUID(),
      version: 1,
      method: "mechanical",
      equipment: machine.code,
      equipmentId: machine.id,
      procedure: "SIMULATED",
      procedureVersion: "1",
      confirmed: true,
    },
  );
  assert.equal(started.status, 200);
  assert.deepEqual(
    (await started.json()).attempts[0].registeredEquipment,
    machine,
  );
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    assert.deepEqual(
      await new EquipmentRegistry(reopened).get(s, machine.id, 1),
      machine,
    );
    assert.deepEqual(
      (await new ProcessingRegistry(reopened).get(s, received.id)).attempts[0]
        .registeredEquipment,
      machine,
    );
  } finally {
    reopened.close();
  }
});
test("equipment source authorization is required before a workflow can query repository state", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    server = createServer();
  let calls = 0;
  server.on(
    "request",
    createSterileApp({
      repository: {
        transaction: async () => {
          calls++;
          throw Error("must not query");
        },
      },
      authenticate: async () => ({
        tenantId: s.tenantId,
        actorId: s.actorId,
        facilityIds: [s.facilityId],
      }),
      authorize: async (scope, cap, permission) =>
        permission === "processing:write" || permission === "cycles:write",
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
      "/processing/" +
      randomUUID() +
      "/start",
    {
      method: "POST",
      headers: {
        authorization: "Bearer demo",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        version: 1,
        method: "mechanical",
        procedure: "SIMULATED",
        procedureVersion: "1",
        equipment: "DEMO",
        equipmentId: randomUUID(),
        confirmed: true,
      }),
    },
  );
  assert.equal(r.status, 403);
  assert.equal(calls, 0);
});
