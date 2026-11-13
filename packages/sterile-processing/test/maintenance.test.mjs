import { independentInspector } from "./memory-repository.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  MaintenanceRegistry,
  ProcessingRegistry,
  TrayRegistry,
  TraceabilityRegistry,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const b = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  confirmed: true,
  ...extra,
});
const fail = (p, code) => assert.rejects(p, (e) => e.code === code);
export async function fixture(repo = new MemoryRepository()) {
  const s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    ir = new InstrumentRegistry(repo),
    m = new MaintenanceRegistry(repo),
    p = new ProcessingRegistry(repo);
  const type = await ir.createType(s, {
    requestId: randomUUID(),
    code: "CLAMP",
    name: "Clamp",
    manufacturer: "",
    model: "",
  });
  const i = await ir.register(s, {
    requestId: randomUUID(),
    code: "INS-MAINT",
    instrumentTypeId: type.id,
    serialNumber: "1",
  });
  return { repo, s, ir, m, p, i, type };
}
export const report = (f) =>
  f.m.report(
    f.s,
    f.i.id,
    b(1, { defect: "Damaged hinge", location: "Quarantine" }),
  );
export async function repaired(f) {
  await report(f);
  await f.m.assess(
    f.s,
    f.i.id,
    b(2, { note: "Repairable", evidence: "ASSESS-1" }),
  );
  return f.m.repair(
    f.s,
    f.i.id,
    b(3, {
      note: "Hinge replaced",
      evidence: "SERVICE-1",
      provider: "Service dept",
    }),
  );
}
export const authorization = (extra = {}) =>
  b(4, {
    reason: "Function verified",
    evidence: "FUNCTION-1",
    procedure: "REPROCESS-1",
    procedureVersion: "1",
    code: "MAINT-REC-1",
    location: "Receiving quarantine",
    custodian: "Receiver",
    functionalChecked: true,
    ...extra,
  });
test("maintenance hold, staged evidence and fresh receiving prevent old availability", async () => {
  const f = await fixture();
  await repaired(f);
  assert.equal((await f.ir.get(f.s, f.i.id)).state, "maintenance");
  await fail(
    f.p.receive(f.s, {
      requestId: randomUUID(),
      code: "BYPASS",
      source: "x",
      custodian: "x",
      condition: "x",
      discrepancies: "",
      instrumentIds: [f.i.id],
      confirmed: true,
    }),
    "CONFLICT",
  );
  const tr = new TrayRegistry(f.repo),
    def = await tr.createDefinition(f.s, {
      requestId: randomUUID(),
      code: "TRAY",
      name: "Tray",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 1 }],
    });
  const a = await tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "ARM",
    definitionId: def.id,
    definitionVersion: 1,
  });
  await fail(
    tr.updateContents(f.s, a.id, b(1, { instrumentIds: [f.i.id] })),
    "INSTRUMENT_ASSIGNED",
  );
  const reviewer = { ...f.s, actorId: randomUUID() },
    input = authorization();
  const result = await f.m.authorizeReturn(reviewer, f.i.id, input);
  assert.equal(result.state, "registered");
  assert.equal(result.maintenance[0].authorization.actorId, reviewer.actorId);
  assert.deepEqual(await f.m.authorizeReturn(reviewer, f.i.id, input), result);
  const current = await f.ir.get(f.s, f.i.id),
    e = await f.p.get(f.s, current.processingHold.episodeId);
  assert.equal(e.state, "received");
  assert.equal(e.attempts.length, 0);
  assert.equal(e.inspections.length, 0);
  assert.equal(e.maintenanceSource.maintenanceId, result.maintenance[0].id);
  await fail(
    tr.updateContents(f.s, a.id, b(1, { instrumentIds: [f.i.id] })),
    "PROCESSING_HOLD",
  );
  const events = await f.ir.history(f.s, f.i.id);
  assert.equal(
    events.items.filter((x) => x.action.startsWith("maintenance-")).length,
    4,
  );
});
test("maintenance validates sequence, fields, confirmation and stale versions", async () => {
  const f = await fixture();
  await fail(
    f.m.report(f.s, f.i.id, b(1, { defect: "", location: "x" })),
    "INVALID_REQUEST",
  );
  await fail(
    f.m.report(
      f.s,
      f.i.id,
      b(1, { defect: "x", location: "x", confirmed: false }),
    ),
    "INVALID_REQUEST",
  );
  await report(f);
  await fail(
    f.m.repair(f.s, f.i.id, b(2, { note: "x", evidence: "x", provider: "x" })),
    "CONFLICT",
  );
  await fail(
    f.m.assess(f.s, f.i.id, b(1, { note: "x", evidence: "x" })),
    "CONFLICT",
  );
  await fail(
    f.m.authorizeReturn(f.s, f.i.id, authorization({ version: 2 })),
    "CONFLICT",
  );
  await fail(
    f.m.authorizeReturn(
      f.s,
      f.i.id,
      authorization({ version: 2, functionalChecked: false }),
    ),
    "INVALID_REQUEST",
  );
  await fail(
    f.ir.retire(f.s, f.i.id, {
      requestId: randomUUID(),
      version: 2,
      reason: "bypass",
    }),
    "CONFLICT",
  );
});
test("maintenance respects processing and tray custody and scope", async () => {
  const f = await fixture();
  const e = await f.p.receive(f.s, {
    requestId: randomUUID(),
    code: "REC",
    source: "x",
    custodian: "x",
    condition: "x",
    discrepancies: "",
    instrumentIds: [f.i.id],
    confirmed: true,
  });
  await fail(report(f), "PROCESSING_HOLD");
  await fail(
    f.m.report(
      { ...f.s, facilityId: randomUUID() },
      f.i.id,
      b(1, { defect: "x", location: "x" }),
    ),
    "NOT_FOUND",
  );
  const g = await fixture(),
    tr = new TrayRegistry(g.repo),
    d = await tr.createDefinition(g.s, {
      requestId: randomUUID(),
      code: "TRAY",
      name: "Tray",
      requirements: [{ instrumentTypeId: g.type.id, quantity: 1 }],
    });
  const a = await tr.createAssembly(g.s, {
    requestId: randomUUID(),
    code: "ARM",
    definitionId: d.id,
    definitionVersion: 1,
  });
  await tr.updateContents(g.s, a.id, b(1, { instrumentIds: [g.i.id] }));
  await fail(report(g), "INSTRUMENT_ASSIGNED");
});
test("maintenance atomic rollback includes new receiving, holds and evidence", async () => {
  const f = await fixture();
  await repaired(f);
  const before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.m.authorizeReturn(f.s, f.i.id, authorization()));
  assert.deepEqual(f.repo.state, before);
});
test("competing maintenance commands cannot overwrite a stage", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([report(f), report(f)]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await f.ir.get(f.s, f.i.id)).maintenance.length, 1);
});
test("new recall restrictions still prevent maintenance authorization", async () => {
  const f = await fixture();
  await repaired(f);
  f.repo.state.recallInstruments.push({
    tenantId: f.s.tenantId,
    facilityId: f.s.facilityId,
    instrumentId: f.i.id,
    recallId: randomUUID(),
  });
  // Inject only the read gate to represent a concurrently recorded recall, without inventing a package fixture.
  const repository = {
    transaction: (s, work) =>
      f.repo.transaction(s, (tx) =>
        work({
          ...tx,
          findInstrumentRecallBlock: async () => ({
            caseId: randomUUID(),
            caseCode: "RECALL",
            state: "open",
            count: 1,
          }),
        }),
      ),
  };
  await fail(
    new MaintenanceRegistry(repository).authorizeReturn(
      f.s,
      f.i.id,
      authorization(),
    ),
    "RECALL_BLOCKED",
  );
});
test("maintenance trace shows current hold, evidence and linked receiving; new processing can continue", async () => {
  const f = await fixture();
  await repaired(f);
  const trace = new TraceabilityRegistry(f.repo);
  let report = await trace.report(f.s, "instrument", f.i.id);
  assert.ok(report.alerts.some((x) => x.kind === "maintenance_hold"));
  await f.m.authorizeReturn(f.s, f.i.id, authorization());
  const instrument = await f.ir.get(f.s, f.i.id),
    id = instrument.processingHold.episodeId;
  await f.p.start(
    f.s,
    id,
    b(1, {
      method: "manual",
      procedure: "CLEAN",
      procedureVersion: "1",
      equipment: "",
    }),
  );
  await f.p.finish(
    f.s,
    id,
    b(2, { outcome: "passed", evidence: "NEW-CLEAN", note: "" }),
  );
  await f.p.inspect(
    independentInspector(f.s),
    id,
    b(3, {
      procedure: "INSPECT",
      procedureVersion: "1",
      evidence: "NEW-INSPECTION",
      items: [
        {
          instrumentId: f.i.id,
          clean: true,
          dry: true,
          intact: true,
          functional: true,
          note: "",
        },
      ],
    }),
  );
  const tr = new TrayRegistry(f.repo),
    d = await tr.createDefinition(f.s, {
      requestId: randomUUID(),
      code: "NEW-TRAY",
      name: "New tray",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 1 }],
    });
  const a = await tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "NEW-ARM",
    definitionId: d.id,
    definitionVersion: 1,
  });
  await tr.updateContents(f.s, a.id, b(1, { instrumentIds: [f.i.id] }));
  report = await trace.report(f.s, "instrument", f.i.id);
  assert.equal(
    report.alerts.some((x) => x.kind === "maintenance_hold"),
    false,
  );
  assert.ok(
    report.links.some(
      (x) => x.relation === "maintenance_receiving" && x.toId === id,
    ),
  );
  assert.ok(
    report.nodes
      .find((x) => x.kind === "instrument")
      .snapshots.some((x) =>
        x.facts.some((v) => v.kind === "maintenance-repaired"),
      ),
  );
});
test("only reviewed repair authorization resets service baseline, retains lifetime exposure and requires fresh processing", async () => {
  const { ServiceUsageRegistry, serviceDue } = await import("../dist/index.js"),
    f = await fixture(),
    u = new ServiceUsageRegistry(f.repo);
  await u.configure(f.s, f.i.id, {
    requestId: randomUUID(),
    version: 0,
    interval: 1,
    warningBefore: 0,
    reference: "DEMO",
    confirmed: true,
  });
  f.repo.state.serviceUsages[0].totalRecorded = 4;
  f.repo.state.serviceUsages[0].version = 2;
  await repaired(f);
  assert.ok(serviceDue((await u.get(f.s, f.i.id)).usage));
  f.repo.failAudit = true;
  const before = structuredClone(f.repo.state);
  await assert.rejects(f.m.authorizeReturn(f.s, f.i.id, authorization()));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const b = authorization(),
    i = await f.m.authorizeReturn(f.s, f.i.id, b);
  await f.m.authorizeReturn(f.s, f.i.id, b);
  const r = (await u.get(f.s, f.i.id)).usage;
  assert.equal(r.totalRecorded, 4);
  assert.equal(r.serviceBaseline, 4);
  assert.ok(r.lastServiceAt);
  assert.equal(serviceDue(r), false);
  assert.ok((await f.ir.get(f.s, i.id)).processingHold);
  assert.equal(r.interval, 1);
});
