import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  EquipmentRegistry,
  InstrumentRegistry,
  ProcessingRegistry,
  equipmentStatus,
  TraceabilityRegistry,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const scope = () => ({
  tenantId: randomUUID(),
  facilityId: randomUUID(),
  actorId: randomUUID(),
});
export const equipmentBody = (extra = {}) => ({
  requestId: randomUUID(),
  code: "STER-DEMO",
  name: "Demo machine",
  kind: "sterilizer",
  methods: ["steam"],
  manufacturer: "DEMO",
  model: "DEMO",
  serialNumber: "DEMO-1",
  location: "DEMO-AREA",
  state: "in_service",
  lastServicedAt: new Date(Date.now() - 86400000).toISOString(),
  serviceDueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  serviceReference: "SIMULATED-SERVICE",
  qualificationDueAt: new Date(Date.now() + 365 * 86400000).toISOString(),
  qualificationReference: "SIMULATED-QUALIFICATION",
  reason: "SIMULATED setup",
  confirmed: true,
  ...extra,
});
const serviceBody = (r, extra = {}) => ({
  requestId: randomUUID(),
  version: r.version,
  state: r.state,
  lastServicedAt: r.lastServicedAt,
  serviceDueAt: r.serviceDueAt,
  serviceReference: r.serviceReference,
  qualificationDueAt: r.qualificationDueAt,
  qualificationReference: r.qualificationReference,
  reason: "SIMULATED service decision",
  confirmed: true,
  ...extra,
});
const fail = (p, code) => assert.rejects(p, (e) => e.code === code);
test("equipment identity and service history are versioned, scoped and retry-safe", async () => {
  const repo = new MemoryRepository(),
    s = scope(),
    er = new EquipmentRegistry(repo),
    input = equipmentBody(),
    r = await er.register(s, input);
  assert.deepEqual(await er.register(s, input), r);
  const held = await er.hold(s, r.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "SIMULATED fault",
    confirmed: true,
  });
  assert.equal(held.state, "out_of_service");
  assert.equal((await er.get(s, r.id, 1)).state, "in_service");
  const restored = await er.recordService(
    s,
    r.id,
    serviceBody(held, {
      state: "in_service",
      serviceReference: "SIMULATED-REPAIR",
    }),
  );
  assert.equal(restored.version, 3);
  assert.equal(restored.serialNumber, r.serialNumber);
  assert.equal((await er.history(s, r.id)).items.length, 3);
  await fail(er.recordService(s, r.id, serviceBody(r)), "CONFLICT");
  for (const foreign of [
    { ...s, facilityId: randomUUID() },
    { ...s, tenantId: randomUUID() },
  ]) {
    assert.equal((await er.list(foreign)).items.length, 0);
    await fail(er.get(foreign, r.id, 1), "NOT_FOUND");
    await fail(
      er.hold(foreign, r.id, {
        requestId: randomUUID(),
        version: 3,
        reason: "SIMULATED",
        confirmed: true,
      }),
      "NOT_FOUND",
    );
  }
});
test("equipment audit failures roll back service, immutable versions and idempotency receipts", async () => {
  const repo = new MemoryRepository(),
    s = scope(),
    er = new EquipmentRegistry(repo),
    r = await er.register(s, equipmentBody());
  const input = serviceBody(r, { state: "out_of_service" });
  repo.failAudit = true;
  await assert.rejects(er.recordService(s, r.id, input));
  assert.equal((await er.get(s, r.id)).version, 1);
  await fail(er.get(s, r.id, 2), "NOT_FOUND");
  repo.failAudit = false;
  const next = await er.recordService(s, r.id, input);
  assert.equal(next.version, 2);
  assert.deepEqual(await er.recordService(s, r.id, input), next);
  const results = await Promise.allSettled([
    er.recordService(s, r.id, serviceBody(next)),
    er.recordService(s, r.id, serviceBody(next)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("equipment validates dates, declared methods and explicit confirmation, with exact due boundaries", async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now });
  const repo = new MemoryRepository(),
    s = scope(),
    er = new EquipmentRegistry(repo);
  for (const extra of [
    { confirmed: false },
    { methods: [] },
    { kind: "washer_disinfector", methods: ["steam"] },
    { methods: ["steam", "steam"] },
    { lastServicedAt: new Date(now + 1).toISOString() },
    { serviceDueAt: new Date(now).toISOString() },
    { qualificationDueAt: new Date(now).toISOString() },
    { serviceDueAt: "2026-02-30T00:00:00.000Z" },
  ])
    await assert.rejects(er.register(s, equipmentBody(extra)));
  const r = await er.register(s, equipmentBody());
  assert.equal(equipmentStatus(r, Date.parse(r.serviceDueAt) - 1), "ready");
  assert.equal(
    equipmentStatus(r, Date.parse(r.serviceDueAt)),
    "service_overdue",
  );
  assert.equal(
    equipmentStatus(
      { ...r, qualificationDueAt: new Date(now).toISOString() },
      now,
    ),
    "qualification_overdue",
  );
});
test("mechanical cleaning freezes the selected washer and blocks wrong, overdue, held and code-only bypasses", async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now });
  const repo = new MemoryRepository(),
    s = scope(),
    er = new EquipmentRegistry(repo),
    ir = new InstrumentRegistry(repo),
    pr = new ProcessingRegistry(repo);
  const type = await ir.createType(s, {
    requestId: randomUUID(),
    code: "TYPE",
    name: "Demo",
    manufacturer: "",
    model: "",
  });
  async function receipt() {
    const i = await ir.register(s, {
      requestId: randomUUID(),
      code: "I-" + randomUUID(),
      instrumentTypeId: type.id,
      serialNumber: "",
    });
    return pr.receive(s, {
      requestId: randomUUID(),
      code: "REC-" + randomUUID(),
      source: "DEMO",
      custodian: "DEMO",
      condition: "DEMO",
      discrepancies: "",
      instrumentIds: [i.id],
      confirmed: true,
    });
  }
  const e = await receipt(),
    washer = await er.register(
      s,
      equipmentBody({
        code: "WASHER",
        kind: "washer_disinfector",
        methods: [],
      }),
    );
  const start = {
    requestId: randomUUID(),
    version: 1,
    method: "mechanical",
    equipment: washer.code,
    equipmentId: washer.id,
    procedure: "SIMULATED",
    procedureVersion: "1",
    confirmed: true,
  };
  const started = await pr.start(s, e.id, start);
  assert.deepEqual(started.attempts[0].registeredEquipment, washer);
  await er.hold(s, washer.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "SIMULATED fault",
    confirmed: true,
  });
  const e2 = await receipt();
  await fail(
    pr.start(s, e2.id, { ...start, requestId: randomUUID() }),
    "EQUIPMENT_BLOCKED",
  );
  const { equipmentId, ...legacy } = start;
  await fail(
    pr.start(s, e2.id, { ...legacy, requestId: randomUUID() }),
    "EQUIPMENT_BLOCKED",
  );
  const finished = await pr.finish(s, e.id, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "SIMULATED",
    note: "Outcome recorded after equipment hold",
    confirmed: true,
  });
  assert.deepEqual(finished.attempts[0].registeredEquipment, washer);
  const trace = await new TraceabilityRegistry(repo).report(
    s,
    "instrument",
    finished.instruments[0].id,
  );
  assert.ok(
    trace.nodes
      .flatMap((n) => n.snapshots)
      .flatMap((s) => s.facts)
      .some((f) => f.kind === "equipment_start"),
  );
  const wrong = await er.register(s, equipmentBody({ code: "WRONG-KIND" }));
  await fail(
    pr.start(s, e2.id, {
      ...start,
      requestId: randomUUID(),
      equipmentId: wrong.id,
      equipment: wrong.code,
    }),
    "EQUIPMENT_BLOCKED",
  );
  const due = await er.register(
    s,
    equipmentBody({
      code: "DUE-WASHER",
      kind: "washer_disinfector",
      methods: [],
      serviceDueAt: new Date(now + 10000).toISOString(),
    }),
  );
  t.mock.timers.setTime(now + 10000);
  await fail(
    pr.start(s, e2.id, {
      ...start,
      requestId: randomUUID(),
      equipmentId: due.id,
      equipment: due.code,
    }),
    "EQUIPMENT_BLOCKED",
  );
});

test("washer incident packages follow the exact cleaning attempt in inspection proof, excluding later successful manual re-cleaning", async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now });
  const repo = new MemoryRepository(),
    s = scope(),
    { TrayRegistry, PackagingRegistry, EquipmentIncidentRegistry } =
      await import("../dist/index.js"),
    er = new EquipmentRegistry(repo),
    ir = new InstrumentRegistry(repo),
    pr = new ProcessingRegistry(repo),
    tr = new TrayRegistry(repo),
    pk = new PackagingRegistry(repo),
    inc = new EquipmentIncidentRegistry(repo),
    washer = await er.register(
      s,
      equipmentBody({
        code: "WASHER-INCIDENT",
        kind: "washer_disinfector",
        methods: [],
      }),
    ),
    type = await ir.createType(s, {
      requestId: randomUUID(),
      code: "WASH-TYPE",
      name: "Demo",
      manufacturer: "",
      model: "",
    });
  async function pack(retry) {
    const key = randomUUID(),
      i = await ir.register(s, {
        requestId: randomUUID(),
        code: "I-" + key,
        instrumentTypeId: type.id,
        serialNumber: "",
      });
    let e = await pr.receive(s, {
      requestId: randomUUID(),
      code: "REC-" + key,
      source: "DEMO",
      custodian: "DEMO",
      condition: "DEMO",
      discrepancies: "",
      instrumentIds: [i.id],
      confirmed: true,
    });
    e = await pr.start(s, e.id, {
      requestId: randomUUID(),
      version: e.version,
      method: "mechanical",
      equipment: washer.code,
      equipmentId: washer.id,
      procedure: "SIMULATED",
      procedureVersion: "1",
      confirmed: true,
    });
    e = await pr.finish(s, e.id, {
      requestId: randomUUID(),
      version: e.version,
      outcome: retry ? "failed" : "passed",
      evidence: "SIMULATED",
      note: retry ? "SIMULATED failure" : "",
      confirmed: true,
    });
    if (retry) {
      e = await pr.start(s, e.id, {
        requestId: randomUUID(),
        version: e.version,
        method: "manual",
        equipment: "",
        procedure: "SIMULATED",
        procedureVersion: "1",
        confirmed: true,
      });
      e = await pr.finish(s, e.id, {
        requestId: randomUUID(),
        version: e.version,
        outcome: "passed",
        evidence: "SIMULATED",
        note: "",
        confirmed: true,
      });
    }
    e = await pr.inspect(s, e.id, {
      requestId: randomUUID(),
      version: e.version,
      procedure: "SIMULATED",
      procedureVersion: "1",
      evidence: "SIMULATED",
      items: [
        {
          instrumentId: i.id,
          clean: true,
          dry: true,
          intact: true,
          functional: true,
          note: "",
        },
      ],
      confirmed: true,
    });
    const d = await tr.createDefinition(s, {
      requestId: randomUUID(),
      code: "DEF-" + key,
      name: "Demo",
      requirements: [{ instrumentTypeId: type.id, quantity: 1 }],
    });
    let a = await tr.createAssembly(s, {
      requestId: randomUUID(),
      code: "ARM-" + key,
      definitionId: d.id,
      definitionVersion: 1,
    });
    a = await tr.updateContents(s, a.id, {
      requestId: randomUUID(),
      version: a.version,
      instrumentIds: [i.id],
    });
    a = await tr.transition(s, a.id, {
      requestId: randomUUID(),
      version: a.version,
      action: "complete",
      reason: "",
      confirmed: true,
    });
    return pk.pack(s, {
      requestId: randomUUID(),
      code: "PK-" + key,
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
  }
  const recleaned = await pack(true),
    exposed = await pack(false);
  t.mock.timers.setTime(now + 1);
  const impact = await inc.preview(
    s,
    washer.id,
    new Date(now - 1).toISOString(),
    new Date(now + 1).toISOString(),
  );
  assert.equal(impact.exposures.length, 2);
  assert.deepEqual(
    impact.targets.map((p) => p.id),
    [exposed.id],
  );
  assert.ok(!impact.targets.some((p) => p.id === recleaned.id));
  assert.equal(impact.targets[0].cleaning[0].attempt, 1);
  assert.equal(impact.unpackagedInstrumentIds.length, 1);
  assert.ok(impact.exposures.some((e) => e.kind === "cleaning" &&
    e.packageIds.length === 0 &&
    impact.unpackagedInstrumentIds.includes(e.instrumentIds[0])));
  assert.ok(impact.exposures.some((e) => e.kind === "cleaning" &&
    e.packageIds.includes(exposed.id) &&
    !impact.unpackagedInstrumentIds.includes(e.instrumentIds[0])));
  assert.ok(impact.impactHash.match(/^[a-f0-9]{64}$/));
});

test("incident preview retains uncovered instrument when another instrument from the same cleaning attempt is packaged", async (t) => {
  const now = Date.now();
  t.mock.timers.enable({ apis: ["Date"], now });
  const backing = new MemoryRepository(), s = scope(),
    { EquipmentIncidentRegistry } = await import("../dist/index.js"),
    machine = await new EquipmentRegistry(backing).register(s,
      equipmentBody({ code: "MIXED-WASHER", kind: "washer_disinfector", methods: [] })),
    episodeId = randomUUID(), coveredId = randomUUID(),
    uncoveredId = randomUUID(), packageId = randomUUID(),
    from = new Date(now - 60000).toISOString(),
    to = new Date(now).toISOString();
  const episode = {
    id: episodeId, code: "MIXED-CLEANING", version: 1,
    state: "ready_for_assembly",
    instruments: [{ id: coveredId }, { id: uncoveredId }],
    attempts: [{
      number: 1, method: "mechanical", equipment: machine.code,
      registeredEquipment: { id: machine.id, version: machine.version },
      startedAt: new Date(now - 30000).toISOString(),
      finishedAt: new Date(now - 20000).toISOString(),
      outcome: "passed",
    }],
  };
  let proofs = [{ instrumentId: coveredId, episodeId, cleaningAttempt: 1 }];
  const repository = {
    transaction: (scope, fn) => backing.transaction(scope, (tx) =>
      fn(Object.assign(Object.create(tx), {
        equipmentExposureCandidates: async () => ({ processing: [episode], loads: [] }),
        equipmentIncidentPackages: async () => [{
          id: packageId, code: "PARTIAL-PACKAGE", version: 1,
          state: "packaged", inspectionProofs: proofs,
        }],
        findDistributionByPackage: async () => null,
      }))),
  };
  const incidents = new EquipmentIncidentRegistry(repository);
  const impact = await incidents.preview(s, machine.id, from, to);
  assert.equal(impact.exposures.length, 1);
  assert.deepEqual(impact.exposures[0].instrumentIds, [coveredId, uncoveredId].sort());
  assert.deepEqual(impact.exposures[0].packageIds, [packageId]);
  assert.deepEqual(impact.targets.map((p) => p.id), [packageId]);
  assert.deepEqual(impact.unpackagedInstrumentIds, [uncoveredId]);
  const hash = impact.impactHash;
  proofs = [
    { instrumentId: coveredId, episodeId, cleaningAttempt: 1 },
    { instrumentId: uncoveredId, episodeId, cleaningAttempt: 1 },
  ];
  const fullyCovered = await incidents.preview(s, machine.id, from, to);
  assert.deepEqual(fullyCovered.unpackagedInstrumentIds, []);
  assert.notEqual(fullyCovered.impactHash, hash);
  proofs = [{ instrumentId: coveredId, episodeId, cleaningAttempt: 2 }];
  const mismatchedAttempt = await incidents.preview(s, machine.id, from, to);
  assert.deepEqual(mismatchedAttempt.unpackagedInstrumentIds,
    [coveredId, uncoveredId].sort());
  assert.equal(mismatchedAttempt.targets.length, 0);
});

test("incident investigation findings are versioned, idempotent, scoped and audit-backed", async () => {
  const repo = new MemoryRepository(), s = scope(),
    { EquipmentIncidentRegistry } = await import("../dist/index.js"),
    machine = await new EquipmentRegistry(repo).register(s,
      equipmentBody({ code: "INVESTIGATION-WASHER", kind: "washer_disinfector", methods: [] })),
    registry = new EquipmentIncidentRegistry(repo),
    now = Date.now(),
    from = new Date(now - 60000).toISOString(),
    to = new Date(now - 1000).toISOString(),
    impact = await registry.preview(s, machine.id, from, to),
    incident = await registry.create(s, {
      requestId: randomUUID(), code: "INVESTIGATION-DEMO", equipmentId: machine.id,
      from, to, impactHash: impact.impactHash, reason: "SIMULATED review",
      reference: "SIMULATED-REF", confirmed: true,
    });
  const requestId = randomUUID();
  const input = {
    requestId, version: incident.version, finding: "SIMULATED investigation evidence",
    reference: "SIMULATED-FINDING-1", instrumentIds: [], packageIds: [],
    confirmed: true,
  };
  const recorded = await registry.recordFinding(s, incident.id, input);
  assert.equal(recorded.version, 2);
  assert.equal(recorded.findings.length, 1);
  assert.equal(recorded.findings[0].actorId, s.actorId);
  assert.equal(recorded.findings[0].finding, input.finding);
  assert.deepEqual(await registry.recordFinding(s, incident.id, input), recorded);
  assert.equal((await registry.get(s, incident.id, 1)).findings.length, 0);
  assert.equal((await registry.get(s, incident.id, 2)).findings.length, 1);
  assert.equal(repo.state.audit.filter(a =>
    a.entityId === incident.id && a.action === "equipment-incident-finding-recorded").length, 1);
  await fail(registry.recordFinding(s, incident.id, {
    ...input, requestId: randomUUID(), finding: "SIMULATED stale update",
  }), "CONFLICT");
  await fail(registry.recordFinding(s, incident.id, {
    ...input, requestId: randomUUID(), version: 2,
    instrumentIds: [randomUUID()],
  }), "INVALID_REQUEST");
  await fail(registry.recordFinding(s, incident.id, {
    ...input, requestId: randomUUID(), version: 2, confirmed: false,
  }), "INVALID_REQUEST");
  for (const foreign of [
    { ...s, tenantId: randomUUID() }, { ...s, facilityId: randomUUID() },
  ]) {
    await fail(registry.get(foreign, incident.id), "NOT_FOUND");
    await fail(registry.recordFinding(foreign, incident.id, {
      ...input, requestId: randomUUID(), version: 2,
    }), "NOT_FOUND");
  }
  assert.equal((await registry.get(s, incident.id)).version, 2);
});

test("incident instrument hold is explicit, audited, idempotent and blocks receiving", async () => {
  const repo = new MemoryRepository(), s = scope(),
    { EquipmentIncidentRegistry } = await import("../dist/index.js"),
    instruments = new InstrumentRegistry(repo),
    type = await instruments.createType(s, {
      requestId: randomUUID(), code: "INC-HOLD-TYPE", name: "Demo instrument",
      manufacturer: "DEMO", model: "DEMO",
    }),
    instrument = await instruments.register(s, {
      requestId: randomUUID(), instrumentTypeId: type.id,
      code: "INC-HOLD-INSTRUMENT", serialNumber: "SIMULATED-1",
    }),
    machine = await new EquipmentRegistry(repo).register(s,
      equipmentBody({ code: "INC-HOLD-WASHER", kind: "washer_disinfector", methods: [] })),
    now = Date.now(),
    from = new Date(now - 60000).toISOString(),
    to = new Date(now - 1000).toISOString(),
    episodeId = randomUUID(),
    episode = {
      id: episodeId, code: "INC-HOLD-EPISODE", version: 2, state: "cleaned",
      instruments: [{ id: instrument.id, code: instrument.code }],
      attempts: [{
        number: 1, method: "mechanical", equipment: machine.code,
        registeredEquipment: { id: machine.id, version: machine.version },
        startedAt: new Date(now - 30000).toISOString(),
        finishedAt: new Date(now - 20000).toISOString(), outcome: "passed",
      }],
    },
    backing = repo,
    wrapped = {
      transaction: (scope, fn) => backing.transaction(scope, tx =>
        fn(Object.assign(Object.create(tx), {
          equipmentExposureCandidates: async () => ({ processing: [episode], loads: [] }),
          equipmentIncidentPackages: async () => [],
        }))),
    },
    incidents = new EquipmentIncidentRegistry(wrapped),
    impact = await incidents.preview(s, machine.id, from, to),
    incident = await incidents.create(s, {
      requestId: randomUUID(), code: "INC-HOLD-CASE", equipmentId: machine.id,
      from, to, impactHash: impact.impactHash, reason: "SIMULATED issue",
      reference: "SIMULATED-EVIDENCE", confirmed: true,
    });
  assert.deepEqual(impact.unpackagedInstrumentIds, [instrument.id]);
  const input = {
    requestId: randomUUID(), version: 1, instrumentId: instrument.id,
    instrumentVersion: instrument.version, reason: "SIMULATED hold", confirmed: true,
  };
  const held = await incidents.holdInstrument(s, incident.id, input);
  assert.equal(held.version, 2);
  assert.deepEqual(await incidents.holdInstrument(s, incident.id, input), held);
  const changed = await instruments.get(s, instrument.id);
  assert.equal(changed.incidentHold.incidentId, incident.id);
  assert.equal(changed.version, instrument.version + 1);
  assert.equal((await incidents.get(s, incident.id, 1)).version, 1);
  assert.equal(repo.state.audit.filter(a =>
    a.entityId === instrument.id && a.action === "equipment-incident-instrument-held").length, 1);
  await fail(incidents.holdInstrument(s, incident.id, {
    ...input, requestId: randomUUID(), version: 2,
  }), "CONFLICT");
  await fail(incidents.holdInstrument(s, incident.id, {
    ...input, requestId: randomUUID(), version: 2,
    instrumentId: randomUUID(),
  }), "INVALID_REQUEST");
  await fail(new ProcessingRegistry(repo).receive(s, {
    requestId: randomUUID(), code: "INC-HOLD-RECEIVE",
    source: "SIMULATED", custodian: "SIMULATED", condition: "SIMULATED",
    discrepancies: "", instrumentIds: [instrument.id], confirmed: true,
  }), "CONFLICT");
});
