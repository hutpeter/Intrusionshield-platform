import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  ProcessingRegistry,
  MaintenanceRegistry,
  TrayRegistry,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const fail = (p, code) => assert.rejects(p, (e) => e.code === code);
async function fixture() {
  const repo = new MemoryRepository(),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    ir = new InstrumentRegistry(repo),
    p = new ProcessingRegistry(repo),
    type = await ir.createType(s, {
      requestId: randomUUID(),
      code: "TYPE",
      name: "Clamp",
      manufacturer: "",
      model: "",
    }),
    register = (code) =>
      ir.register(s, {
        requestId: randomUUID(),
        code,
        instrumentTypeId: type.id,
        serialNumber: code,
      }),
    i = await register("I-1");
  return { repo, s, ir, p, type, i, register };
}
const input = (i, extra = {}) => ({
  requestId: randomUUID(),
  code: "REC-SCAN",
  source: "Department",
  custodian: "Custodian",
  condition: "Used",
  discrepancies: "",
  instrumentIds: [i.id],
  scannedIdentifiers: ["RSP-I-" + i.id.toUpperCase()],
  confirmed: true,
  ...extra,
});
test("scanned receiving saves canonical identifiers and holds through cleaning and inspection", async () => {
  const f = await fixture(),
    b = input(f.i),
    e = await f.p.receiveScanned(f.s, b);
  assert.equal(e.state, "received");
  assert.deepEqual(e.attempts, []);
  assert.deepEqual(e.inspections, []);
  assert.deepEqual(e.receivingScans, [
    { instrumentId: f.i.id, identifier: "RSP-I-" + f.i.id.toUpperCase() },
  ]);
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold.episodeId, e.id);
  assert.deepEqual(await f.p.receiveScanned(f.s, b), e);
  await f.p.start(f.s, e.id, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "CLEAN",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  await f.p.finish(f.s, e.id, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "EVIDENCE",
    note: "",
    confirmed: true,
  });
  await f.p.inspect(f.s, e.id, {
    requestId: randomUUID(),
    version: 3,
    procedure: "INSPECT",
    procedureVersion: "1",
    evidence: "INSPECT",
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
    confirmed: true,
  });
  const latest = await f.p.get(f.s, e.id);
  assert.deepEqual(latest.receivingScans, e.receivingScans);
  assert.equal(latest.state, "ready_for_assembly");
  assert.equal((await f.p.get(f.s, e.id, 1)).state, "received");
});
test("scanned identifiers must be complete, unique, selected and explicitly confirmed", async () => {
  const f = await fixture();
  for (const extra of [
    { scannedIdentifiers: [] },
    { scannedIdentifiers: ["https://example.org"] },
    { scannedIdentifiers: ["RSP-I-" + randomUUID()] },
    { scannedIdentifiers: ["RSP-I-" + f.i.id, "RSP-I-" + f.i.id] },
    { confirmed: false },
    { instrumentIds: [f.i.id, f.i.id] },
  ])
    await fail(f.p.receiveScanned(f.s, input(f.i, extra)), "INVALID_REQUEST");
  assert.equal(f.repo.state.processing.length, 0);
});
test("save rechecks maintenance, processing, recall and assembly restrictions", async () => {
  const f = await fixture(),
    b = input(f.i);
  await new MaintenanceRegistry(f.repo).report(f.s, f.i.id, {
    requestId: randomUUID(),
    version: 1,
    defect: "Damage after scan",
    location: "Quarantine",
    confirmed: true,
  });
  await fail(f.p.receiveScanned(f.s, b), "SCAN_INELIGIBLE");
  const g = await fixture();
  await g.p.receiveScanned(g.s, input(g.i));
  await fail(
    g.p.receiveScanned(g.s, input(g.i, { code: "SECOND" })),
    "PROCESSING_HOLD",
  );
  const h = await fixture(),
    tr = new TrayRegistry(h.repo),
    d = await tr.createDefinition(h.s, {
      requestId: randomUUID(),
      code: "DEF",
      name: "Tray",
      requirements: [{ instrumentTypeId: h.type.id, quantity: 1 }],
    }),
    a = await tr.createAssembly(h.s, {
      requestId: randomUUID(),
      code: "ARM",
      definitionId: d.id,
      definitionVersion: 1,
    });
  await tr.addByScan(h.s, a.id, {
    requestId: randomUUID(),
    version: 1,
    identifier: "RSP-I-" + h.i.id,
    confirmed: true,
  });
  await fail(h.p.receiveScanned(h.s, input(h.i)), "INSTRUMENT_ASSIGNED");
  const blocked = {
    transaction: (s, work) =>
      g.repo.transaction(s, (tx) =>
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
    new ProcessingRegistry(blocked).receiveScanned(
      g.s,
      input(g.i, { code: "RECALL" }),
    ),
    "RECALL_BLOCKED",
  );
});
test("mixed manual and scanned members retain only actual identifier provenance and recheck all members", async () => {
  const f = await fixture(),
    manual = await f.register("MANUAL"),
    e = await f.p.receiveScanned(
      f.s,
      input(f.i, { instrumentIds: [manual.id, f.i.id] }),
    );
  assert.equal(e.instruments.length, 2);
  assert.equal(e.receivingScans.length, 1);
  assert.equal(e.receivingScans[0].instrumentId, f.i.id);
});
test("scope, competing receipts and audit rollback preserve one complete reservation", async () => {
  const f = await fixture();
  await fail(
    f.p.receiveScanned({ ...f.s, facilityId: randomUUID() }, input(f.i)),
    "NOT_FOUND",
  );
  const before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.p.receiveScanned(f.s, input(f.i)));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const result = await Promise.allSettled([
    f.p.receiveScanned(f.s, input(f.i)),
    f.p.receiveScanned(f.s, input(f.i, { code: "OTHER" })),
  ]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(f.repo.state.processingHolds.length, 1);
});
