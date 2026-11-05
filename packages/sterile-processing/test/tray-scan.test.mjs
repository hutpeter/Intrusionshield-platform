import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  TrayRegistry,
  MaintenanceRegistry,
  ProcessingRegistry,
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
    tr = new TrayRegistry(repo),
    t = await ir.createType(s, {
      requestId: randomUUID(),
      code: "CLAMP",
      name: "Clamp",
      manufacturer: "",
      model: "",
    });
  const register = (code, type = t) =>
    ir.register(s, {
      requestId: randomUUID(),
      code,
      instrumentTypeId: type.id,
      serialNumber: code,
    });
  const i = await register("I-1"),
    d = await tr.createDefinition(s, {
      requestId: randomUUID(),
      code: "DEF",
      name: "Tray",
      requirements: [{ instrumentTypeId: t.id, quantity: 1 }],
    });
  const make = (code) =>
    tr.createAssembly(s, {
      requestId: randomUUID(),
      code,
      definitionId: d.id,
      definitionVersion: 1,
    });
  const a = await make("ARM");
  return { repo, s, ir, tr, t, i, d, register, make, a };
}
const scan = (i, extra = {}) => ({
  requestId: randomUUID(),
  version: 1,
  identifier: "RSP-I-" + i.id.toUpperCase(),
  confirmed: true,
  ...extra,
});
test("confirmed scan adds and reserves exactly one instrument with assessment, history and retry receipt", async () => {
  const f = await fixture(),
    input = scan(f.i),
    a = await f.tr.addByScan(f.s, f.a.id, input);
  assert.equal(a.state, "draft");
  assert.equal(a.version, 2);
  assert.equal(a.instruments[0].id, f.i.id);
  const v = await f.tr.assembly(f.s, a.id);
  assert.equal(v.assessment.assigned, 1);
  assert.equal(v.assessment.missing, 0);
  assert.equal(v.assessment.excess, 0);
  assert.equal((await f.ir.get(f.s, f.i.id)).activeAssembly.assemblyId, a.id);
  assert.deepEqual(await f.tr.addByScan(f.s, a.id, input), a);
  assert.equal(
    (await f.tr.assembly(f.s, a.id, 1)).assembly.instruments.length,
    0,
  );
  assert.equal(
    f.repo.state.audit.filter(
      (e) => e.action === "tray-instrument-added-by-scan",
    ).length,
    1,
  );
});
test("duplicate, wrong type, excess and invalid/unconfirmed scans never add contents", async () => {
  const f = await fixture();
  await fail(
    f.tr.addByScan(f.s, f.a.id, scan(f.i, { confirmed: false })),
    "INVALID_REQUEST",
  );
  await fail(
    f.tr.addByScan(
      f.s,
      f.a.id,
      scan(f.i, { identifier: "https://example.org" }),
    ),
    "INVALID_REQUEST",
  );
  const otherType = await f.ir.createType(f.s, {
      requestId: randomUUID(),
      code: "SCISSORS",
      name: "Scissors",
      manufacturer: "",
      model: "",
    }),
    wrong = await f.register("WRONG", otherType);
  await fail(f.tr.addByScan(f.s, f.a.id, scan(wrong)), "SCAN_TYPE");
  await f.tr.addByScan(f.s, f.a.id, scan(f.i));
  await fail(
    f.tr.addByScan(f.s, f.a.id, scan(f.i, { version: 2 })),
    "SCAN_DUPLICATE",
  );
  const extra = await f.register("I-2");
  await fail(
    f.tr.addByScan(f.s, f.a.id, scan(extra, { version: 2 })),
    "SCAN_TYPE",
  );
  assert.equal(
    (await f.tr.assembly(f.s, f.a.id)).assembly.instruments.length,
    1,
  );
});
test("maintenance, retirement, processing and other-tray custody are rejected", async () => {
  const f = await fixture();
  await new MaintenanceRegistry(f.repo).report(f.s, f.i.id, {
    requestId: randomUUID(),
    version: 1,
    defect: "x",
    location: "x",
    confirmed: true,
  });
  await fail(f.tr.addByScan(f.s, f.a.id, scan(f.i)), "SCAN_INELIGIBLE");
  const retired = await f.register("RETIRED");
  await f.ir.retire(f.s, retired.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "x",
  });
  await fail(f.tr.addByScan(f.s, f.a.id, scan(retired)), "SCAN_INELIGIBLE");
  const held = await f.register("HELD");
  await new ProcessingRegistry(f.repo).receive(f.s, {
    requestId: randomUUID(),
    code: "REC",
    source: "x",
    custodian: "x",
    condition: "x",
    discrepancies: "",
    instrumentIds: [held.id],
    confirmed: true,
  });
  await fail(f.tr.addByScan(f.s, f.a.id, scan(held)), "PROCESSING_HOLD");
  const assigned = await f.register("ASSIGNED"),
    a2 = await f.make("OTHER");
  await f.tr.addByScan(f.s, a2.id, scan(assigned));
  await fail(
    f.tr.addByScan(f.s, f.a.id, scan(assigned)),
    "INSTRUMENT_ASSIGNED",
  );
});
test("scan rechecks recall gate and does not append after late audit failure", async () => {
  const f = await fixture();
  const blocked = {
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
    new TrayRegistry(blocked).addByScan(f.s, f.a.id, scan(f.i)),
    "RECALL_BLOCKED",
  );
  const before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.tr.addByScan(f.s, f.a.id, scan(f.i)));
  assert.deepEqual(f.repo.state, before);
});
test("foreign scope, stale version and closed tray cannot receive a scanned member", async () => {
  const f = await fixture();
  await fail(
    f.tr.addByScan({ ...f.s, facilityId: randomUUID() }, f.a.id, scan(f.i)),
    "NOT_FOUND",
  );
  await fail(
    f.tr.addByScan(f.s, f.a.id, scan(f.i, { version: 2 })),
    "CONFLICT",
  );
  await f.tr.transition(f.s, f.a.id, {
    requestId: randomUUID(),
    version: 1,
    action: "disassemble",
    reason: "x",
    confirmed: true,
  });
  await fail(
    f.tr.addByScan(f.s, f.a.id, scan(f.i, { version: 2 })),
    "CONFLICT",
  );
});
test("competing tray scans reserve an instrument once; changed retries do not add another", async () => {
  const f = await fixture(),
    a2 = await f.make("OTHER"),
    input = scan(f.i),
    results = await Promise.allSettled([
      f.tr.addByScan(f.s, f.a.id, input),
      f.tr.addByScan(f.s, a2.id, scan(f.i)),
    ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(f.repo.state.assignments.length, 1);
  const other = await f.register("I-2");
  await fail(
    f.tr.addByScan(f.s, f.a.id, { ...input, identifier: "RSP-I-" + other.id }),
    "CONFLICT",
  );
});
