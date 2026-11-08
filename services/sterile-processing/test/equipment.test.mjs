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

async function incidentSample(f) {
  const r = await f.call("/preview/equipment-incident-example", {
    requestId: randomUUID(),
  });
  assert.equal(r.status, 201);
  return r.json();
}
const incidentBody = (sample, impact) => ({
  requestId: randomUUID(),
  code: "INCIDENT-" + randomUUID(),
  equipmentId: sample.equipment.id,
  from: sample.from,
  to: sample.to,
  impactHash: impact.impactHash,
  reason: "SIMULATED machine fault",
  reference: "SIMULATED-INCIDENT",
  confirmed: true,
});
const impactPath = (f, sample) =>
  f.base +
  "/equipment/" +
  sample.equipment.id +
  "/incident-impact?from=" +
  encodeURIComponent(sample.from) +
  "&to=" +
  encodeURIComponent(sample.to);
test("incident assessment and linked recall require separate reviewer confirmation, strict scope/CSRF and preserve historical provenance", async (t) => {
  const f = await fixture(t),
    sample = await incidentSample(f),
    response = await f.call(impactPath(f, sample));
  assert.equal(response.status, 200);
  const impact = await response.json();
  assert.equal(impact.exposures.length, 1);
  assert.equal(impact.exposures[0].link, "registered");
  assert.equal(impact.targets.length, 1);
  const input = incidentBody(sample, impact);
  assert.equal(
    (
      await f.call(f.base + "/equipment-incidents", input, {
        "x-sterile-csrf": "",
      })
    ).status,
    403,
  );
  await f.login("operator");
  assert.equal(
    (await f.call(f.base + "/equipment-incidents", input)).status,
    403,
  );
  assert.equal(
    (
      await f.call("/preview/equipment-incident-example", {
        requestId: randomUUID(),
      })
    ).status,
    403,
  );
  await f.login("reviewer");
  assert.equal(
    (
      await f.call(f.base + "/equipment-incidents", {
        ...input,
        confirmed: false,
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.call(f.base + "/equipment-incidents", { ...input, extra: true }))
      .status,
    400,
  );
  assert.equal((await f.call(impactPath(f, sample) + "&extra=1")).status, 400);
  assert.equal(
    (
      await f.call(
        impactPath(f, sample).replace(f.session.facilityId, randomUUID()),
      )
    ).status,
    404,
  );
  const saved = await f.call(f.base + "/equipment-incidents", input);
  assert.equal(saved.status, 201);
  const record = await saved.json();
  assert.deepEqual(
    await (await f.call(f.base + "/equipment-incidents", input)).json(),
    record,
  );
  assert.equal(
    (await (await f.call(f.base + "/packages/" + impact.targets[0].id)).json())
      .recall,
    undefined,
  );
  assert.equal(
    (
      await (
        await f.call(
          f.base + "/equipment/" + sample.equipment.id + "/incidents",
        )
      ).json()
    ).items.length,
    1,
  );
  const plan = await (
      await f.call(
        f.base +
          "/equipment-incidents/" +
          record.id +
          "/recall-impact?packageId=" +
          impact.targets[0].id,
      )
    ).json(),
    recallInput = {
      requestId: randomUUID(),
      version: 1,
      packageId: plan.sourceId,
      impactHash: plan.impactHash,
      code: "INCIDENT-RECALL-" + randomUUID(),
      reason: "SIMULATED reviewer decision",
      reference: "SIMULATED",
      confirmed: true,
    },
    recallPath = f.base + "/equipment-incidents/" + record.id + "/recalls";
  await f.login("viewer");
  assert.equal((await f.call(recallPath, recallInput)).status, 403);
  await f.login("reviewer");
  assert.equal(
    (await f.call(recallPath, { ...recallInput, confirmed: false })).status,
    400,
  );
  assert.equal(
    (await f.call(recallPath, { ...recallInput, impactHash: "0".repeat(64) }))
      .status,
    409,
  );
  const linked = await f.call(recallPath, recallInput);
  assert.equal(linked.status, 201);
  const result = await linked.json();
  assert.equal(result.version, 2);
  assert.equal(
    (
      await (
        await f.call(
          f.base + "/equipment-incidents/" + record.id + "/versions/1",
        )
      ).json()
    ).recalls.length,
    0,
  );
  const recall = await (
    await f.call(f.base + "/recalls/" + result.recalls[0].id)
  ).json();
  assert.equal(recall.equipmentIncident.id, record.id);
  assert.equal(recall.equipmentIncident.equipmentCode, sample.equipment.code);
  assert.equal(
    (await (await f.call(f.base + "/packages/" + plan.sourceId)).json()).recall
      .caseId,
    recall.id,
  );
});
test("SQLite incident and recall association survive reopening, and a late incident audit failure rolls all recall blocks back", async (t) => {
  const f = await fixture(t),
    sample = await incidentSample(f),
    { EquipmentIncidentRegistry, PackagingRegistry } =
      await import("@intrusionshield/sterile-processing"),
    s = {
      tenantId: f.session.tenantId,
      facilityId: f.session.facilityId,
      actorId: f.session.actorId,
    },
    inc = new EquipmentIncidentRegistry(f.repo),
    impact = await inc.preview(s, sample.equipment.id, sample.from, sample.to),
    record = await inc.create(s, incidentBody(sample, impact)),
    plan = await inc.recallPreview(s, record.id, impact.targets[0].id),
    input = {
      requestId: randomUUID(),
      version: 1,
      packageId: plan.sourceId,
      impactHash: plan.impactHash,
      code: "SQL-INCIDENT-RECALL",
      reason: "SIMULATED",
      reference: "SIMULATED",
      confirmed: true,
    };
  const failing = new EquipmentIncidentRegistry({
    transaction: (scope, work) =>
      f.repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async (e) => {
            if (e.action === "equipment-incident-recall-created")
              throw Error("late incident audit");
            return tx.appendAudit(e);
          },
        }),
      ),
  });
  await assert.rejects(failing.createRecall(s, record.id, input));
  assert.equal(
    (await new PackagingRegistry(f.repo).get(s, plan.sourceId)).recall,
    undefined,
  );
  assert.equal((await inc.get(s, record.id)).version, 1);
  const linked = await inc.createRecall(s, record.id, input);
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    assert.deepEqual(
      await new EquipmentIncidentRegistry(reopened).get(s, record.id),
      linked,
    );
    assert.deepEqual(
      (await new EquipmentIncidentRegistry(reopened).get(s, record.id, 1))
        .impact,
      impact,
    );
    assert.equal(
      (await new PackagingRegistry(reopened).get(s, plan.sourceId)).recall
        .caseId,
      linked.recalls[0].id,
    );
  } finally {
    reopened.close();
  }
});
test("incident source and recall permissions are checked before any repository access", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    server = createServer();
  let queries = 0,
    denied = "processing:read";
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
  const r = await fetch(
    "http://127.0.0.1:" +
      server.address().port +
      "/api/v1/sterile/facilities/" +
      s.facilityId +
      "/equipment/" +
      randomUUID() +
      "/incident-impact?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z",
    { headers: { authorization: "Bearer demo" } },
  );
  assert.equal(r.status, 403);
  assert.equal(queries, 0);
  denied = "recall:write";
  const blocked = await fetch(
    "http://127.0.0.1:" +
      server.address().port +
      "/api/v1/sterile/facilities/" +
      s.facilityId +
      "/equipment-incidents/" +
      randomUUID() +
      "/recalls",
    {
      method: "POST",
      headers: {
        authorization: "Bearer demo",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        version: 1,
        packageId: randomUUID(),
        impactHash: "0".repeat(64),
        code: "DEMO",
        reason: "SIMULATED",
        reference: "SIMULATED",
        confirmed: true,
      }),
    },
  );
  assert.equal(blocked.status, 403);
  assert.equal(queries, 0);
});
