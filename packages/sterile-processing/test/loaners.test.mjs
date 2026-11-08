import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  LoanerRegistry,
  InstrumentRegistry,
  ProcessingRegistry,
  TrayRegistry,
  MaintenanceRegistry,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const fail = (p, c) => assert.rejects(p, (e) => e.code === c);
async function fixture() {
  const repo = new MemoryRepository(),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    ir = new InstrumentRegistry(repo),
    type = await ir.createType(s, {
      requestId: randomUUID(),
      code: "LOAN-TYPE",
      name: "Loaner clamp",
      manufacturer: "Vendor",
      model: "Demo",
    });
  return {
    repo,
    s,
    ir,
    type,
    l: new LoanerRegistry(repo),
    p: new ProcessingRegistry(repo),
    tr: new TrayRegistry(repo),
  };
}
const body = (f, extra = {}) => ({
  requestId: randomUUID(),
  code: "LOAN-001",
  supplier: "Vendor A",
  supplierReference: "VENDOR-SET-1",
  dueOn: "2026-12-01",
  location: "Receiving",
  custodian: "Courier",
  reference: "DELIVERY-1",
  condition: "Used; processing required",
  note: "",
  contentsChecked: true,
  confirmed: true,
  items: [
    { code: "LOAN-INS-1", instrumentTypeId: f.type.id, serialNumber: "V-001" },
    { code: "LOAN-INS-2", instrumentTypeId: f.type.id, serialNumber: "V-002" },
  ],
  ...extra,
});
const returned = (r, extra = {}) => ({
  requestId: randomUUID(),
  version: r.version,
  instrumentIds: r.items.map((i) => i.id),
  recipient: "Vendor receiver",
  reference: "HANDBACK-1",
  note: "",
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
async function inspected(f, r) {
  await f.p.start(f.s, r.episodeId, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "CLEAN",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  await f.p.finish(f.s, r.episodeId, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "DEMO",
    note: "",
    confirmed: true,
  });
  return f.p.inspect(f.s, r.episodeId, {
    requestId: randomUUID(),
    version: 3,
    procedure: "INSPECT",
    procedureVersion: "1",
    evidence: "DEMO",
    items: r.items.map((i) => ({
      instrumentId: i.id,
      clean: true,
      dry: true,
      intact: true,
      functional: true,
      note: "",
    })),
    confirmed: true,
  });
}
test("loaner receiving freezes supplier and contents, atomically creates identities and fresh processing holds", async () => {
  const f = await fixture(),
    b = body(f),
    r = await f.l.receive(f.s, b);
  assert.equal(r.items.length, 2);
  assert.equal(r.supplier, "Vendor A");
  assert.equal((await f.p.get(f.s, r.episodeId)).state, "received");
  for (const item of r.items) {
    const i = await f.ir.get(f.s, item.id);
    assert.equal(i.externalOwnership.loanerId, r.id);
    assert.equal(i.externalOwnership.supplier, r.supplier);
    assert.equal(i.loanerStatus, "received");
    assert.equal(i.processingHold.episodeId, r.episodeId);
  }
  assert.deepEqual(await f.l.receive(f.s, b), r);
  assert.equal(f.repo.state.instruments.length, 2);
  assert.equal(
    (await f.l.history(f.s, r.id)).items[0].action,
    "loaner-received",
  );
  assert.equal((await f.l.list(f.s)).items[0].count, 2);
  assert.equal("items" in (await f.l.list(f.s)).items[0], false);
});
test("complete inspected and unassigned loaner hand-back preserves receipt and prevents new local processing/assembly", async () => {
  const f = await fixture(),
    r = await f.l.receive(f.s, body(f));
  await fail(
    f.l.returnToSupplier(f.s, r.id, returned(r)),
    "LOANER_UNAVAILABLE",
  );
  await inspected(f, r);
  const b = returned(r),
    out = await f.l.returnToSupplier(f.s, r.id, b);
  assert.equal(out.state, "returned");
  assert.equal(out.handback.proof.length, 2);
  const { TraceabilityRegistry, DashboardRegistry } =
    await import("../dist/index.js");
  const report = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "instrument",
    r.items[0].id,
  );
  assert.ok(report.alerts.some((a) => a.kind === "loaner_returned"));
  assert.ok(JSON.stringify(report).includes("loaner_ownership"));
  f.repo.state.serviceUsages.push({
    ...f.s,
    instrumentId: r.items[0].id,
    interval: 1,
    totalRecorded: 1,
    serviceBaseline: 0,
  });
  assert.equal(
    (await new DashboardRegistry(f.repo).queue(f.s, "maintenance")).queue.total,
    0,
  );

  assert.deepEqual(await f.l.returnToSupplier(f.s, r.id, b), out);
  assert.equal((await f.l.get(f.s, r.id, 1)).state, "received");
  assert.equal((await f.ir.get(f.s, r.items[0].id)).loanerStatus, "returned");
  await fail(
    f.p.receive(f.s, {
      requestId: randomUUID(),
      code: "REENTER",
      source: "Demo",
      custodian: "Demo",
      condition: "Used",
      discrepancies: "",
      instrumentIds: [r.items[0].id],
      confirmed: true,
    }),
    "LOANER_UNAVAILABLE",
  );
  const d = await f.tr.createDefinition(f.s, {
      requestId: randomUUID(),
      code: "NEW",
      name: "New tray",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 2 }],
    }),
    a = await f.tr.createAssembly(f.s, {
      requestId: randomUUID(),
      code: "NEW-A",
      definitionId: d.id,
      definitionVersion: 1,
    });
  await fail(
    f.tr.updateContents(f.s, a.id, {
      requestId: randomUUID(),
      version: 1,
      instrumentIds: r.items.map((i) => i.id),
    }),
    "LOANER_UNAVAILABLE",
  );
  await fail(
    new MaintenanceRegistry(f.repo).report(f.s, r.items[0].id, {
      requestId: randomUUID(),
      version: 1,
      defect: "Demo",
      location: "Demo",
      confirmed: true,
    }),
    "LOANER_UNAVAILABLE",
  );
});
test("loaner receiving cannot relabel existing instruments, admit duplicate codes or bypass scope/confirmations", async () => {
  const f = await fixture(),
    b = body(f);
  for (const patch of [
    { contentsChecked: false },
    { confirmed: false },
    { items: [] },
    { items: [b.items[0], b.items[0]] },
    { dueOn: "2026-02-31" },
    { supplier: "" },
    { items: [{ ...b.items[0], instrumentTypeId: randomUUID() }] },
  ])
    await assert.rejects(f.l.receive(f.s, { ...b, ...patch }));
  assert.equal(f.repo.state.instruments.length, 0);
  const old = await f.ir.register(f.s, {
    requestId: randomUUID(),
    code: b.items[0].code,
    instrumentTypeId: f.type.id,
    serialNumber: "Hospital",
  });
  await fail(f.l.receive(f.s, b), "CONFLICT");
  assert.equal((await f.ir.get(f.s, old.id)).externalOwnership, undefined);
  const r = await f.l.receive(
    f.s,
    body(f, { items: [{ ...b.items[0], code: "OTHER" }] }),
  );
  await fail(f.l.get({ ...f.s, facilityId: randomUUID() }, r.id), "NOT_FOUND");
  assert.equal(
    (await f.l.list({ ...f.s, tenantId: randomUUID() })).items.length,
    0,
  );
});
test("supplier hand-back rejects incomplete declarations, active custody and recall restrictions", async () => {
  const f = await fixture(),
    r = await f.l.receive(f.s, body(f));
  await inspected(f, r);
  await fail(
    f.l.returnToSupplier(
      f.s,
      r.id,
      returned(r, { instrumentIds: [r.items[0].id] }),
    ),
    "LOANER_UNAVAILABLE",
  );
  await fail(
    f.l.returnToSupplier(f.s, r.id, returned(r, { contentsChecked: false })),
    "INVALID_REQUEST",
  );
  await fail(
    f.l.returnToSupplier(f.s, r.id, returned(r, { version: 2 })),
    "CONFLICT",
  );
  const d = await f.tr.createDefinition(f.s, {
      requestId: randomUUID(),
      code: "DEF",
      name: "Tray",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 2 }],
    }),
    a = await f.tr.createAssembly(f.s, {
      requestId: randomUUID(),
      code: "ASM",
      definitionId: d.id,
      definitionVersion: 1,
    });
  await f.tr.updateContents(f.s, a.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: r.items.map((i) => i.id),
  });
  await fail(
    f.l.returnToSupplier(f.s, r.id, returned(r)),
    "LOANER_UNAVAILABLE",
  );
});
test("loaner receipt/hand-back audit errors roll back instruments, holds, versions and retry receipts; races accept one transition", async () => {
  const f = await fixture(),
    before = structuredClone(f.repo.state),
    b = body(f);
  f.repo.failAudit = true;
  await assert.rejects(f.l.receive(f.s, b));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const race = await Promise.allSettled([
    f.l.receive(f.s, b),
    f.l.receive(f.s, { ...b, requestId: randomUUID() }),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  const r = await f.l.get(f.s, f.repo.state.loaners[0].id);
  await inspected(f, r);
  const saved = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.l.returnToSupplier(f.s, r.id, returned(r)));
  assert.deepEqual(f.repo.state, saved);
  f.repo.failAudit = false;
  const outcomes = await Promise.allSettled([
    f.l.returnToSupplier(f.s, r.id, returned(r)),
    f.l.returnToSupplier(f.s, r.id, returned(r)),
  ]);
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await f.l.get(f.s, r.id)).version, 2);
});
const readmission = (r, extra = {}) => ({
  requestId: randomUUID(),
  version: r.version,
  instrumentIds: r.items.map((i) => i.id),
  episodeCode: "LOAN-SECOND-VISIT",
  dueOn: "2026-12-15",
  location: "New receiving",
  custodian: "New courier",
  reference: "SECOND-DELIVERY",
  condition: "Used again",
  note: "Repeat visit",
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
async function handedback() {
  const f = await fixture(),
    r = await f.l.receive(f.s, body(f));
  await inspected(f, r);
  return { ...f, r: await f.l.returnToSupplier(f.s, r.id, returned(r)) };
}
test("loaner readmission reuses identities, creates fresh holds and preserves original visits and service limits", async () => {
  const f = await handedback(),
    identities = structuredClone(f.repo.state.instruments),
    oldEpisode = f.r.episodeId,
    b = readmission(f.r);
  f.repo.state.serviceUsages.push({
    ...f.s,
    id: randomUUID(),
    instrumentId: f.r.items[0].id,
    totalRecorded: 5,
    serviceBaseline: 0,
    interval: 5,
    warningBefore: 1,
    version: 1,
  });
  const usage = structuredClone(f.repo.state.serviceUsages);
  const r = await f.l.readmit({ ...f.s, actorId: randomUUID() }, f.r.id, b);
  assert.equal(r.visit, 2);
  assert.equal(r.version, 3);
  assert.equal(r.state, "received");
  assert.notEqual(r.episodeId, oldEpisode);
  assert.deepEqual(
    r.items.map((i) => i.id),
    f.r.items.map((i) => i.id),
  );
  assert.deepEqual(f.repo.state.instruments, identities);
  assert.deepEqual(f.repo.state.serviceUsages, usage);
  const e = await f.p.get(f.s, r.episodeId);
  assert.equal(e.state, "received");
  assert.deepEqual(e.attempts, []);
  assert.deepEqual(e.inspections, []);
  assert.equal(e.loanerSource.visit, 2);
  for (const i of r.items)
    assert.equal(
      (await f.ir.get(f.s, i.id)).processingHold.episodeId,
      r.episodeId,
    );
  assert.equal((await f.l.get(f.s, r.id, 1)).state, "received");
  assert.equal((await f.l.get(f.s, r.id, 2)).state, "returned");
  assert.equal(
    (await f.l.get(f.s, r.id, 2)).handback.reference,
    f.r.handback.reference,
  );
  await fail(
    f.l.returnToSupplier(f.s, r.id, returned(r)),
    "LOANER_UNAVAILABLE",
  );
});
test("readmission requires complete matching members, returned state, scope and confirmed declarations", async () => {
  const f = await handedback();
  const before = structuredClone(f.repo.state);
  for (const patch of [
    { instrumentIds: [] },
    { instrumentIds: [randomUUID()] },
    { instrumentIds: [f.r.items[0].id, f.r.items[0].id] },
    { confirmed: false },
    { contentsChecked: false },
    { version: 1 },
    { dueOn: "2026-02-31" },
    { reference: "" },
  ]) {
    await assert.rejects(f.l.readmit(f.s, f.r.id, readmission(f.r, patch)));
    assert.deepEqual(f.repo.state, before);
  }
  await fail(
    f.l.readmit({ ...f.s, facilityId: randomUUID() }, f.r.id, readmission(f.r)),
    "NOT_FOUND",
  );
  const caseId = randomUUID();
  f.repo.state.recalls.push({
    ...f.s,
    id: caseId,
    code: "RECALL",
    version: 1,
    state: "open",
  });
  f.repo.state.recallInstruments.push({
    ...f.s,
    recallId: caseId,
    instrumentId: f.r.items[0].id,
  });
  await fail(f.l.readmit(f.s, f.r.id, readmission(f.r)), "LOANER_UNAVAILABLE");
  f.repo.state.recalls = [];
  f.repo.state.recallInstruments = [];
  const r = await f.l.readmit(f.s, f.r.id, readmission(f.r));
  await fail(f.l.readmit(f.s, r.id, readmission(r)), "CONFLICT");
});
test("readmission retries and races create one new episode; audit failure restores supplier-returned state", async () => {
  const f = await handedback(),
    b = readmission(f.r),
    before = structuredClone(f.repo.state);
  const broken = {
    transaction: (scope, work) =>
      f.repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async (event) => {
            if (event.action === "loaner-readmitted")
              throw Error("late audit unavailable");
            return tx.appendAudit(event);
          },
        }),
      ),
  };
  await assert.rejects(
    new LoanerRegistry(broken).readmit(f.s, f.r.id, b),
    /late audit unavailable/,
  );
  assert.deepEqual(f.repo.state, before);
  const results = await Promise.allSettled([
    f.l.readmit(f.s, f.r.id, b),
    f.l.readmit(f.s, f.r.id, {
      ...b,
      requestId: randomUUID(),
      episodeCode: "OTHER-SECOND",
    }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const r = await f.l.get(f.s, f.r.id);
  assert.deepEqual(await f.l.readmit(f.s, f.r.id, b), r);
  assert.equal(f.repo.state.processing.length, 2);
  assert.equal(f.repo.state.instruments.length, 2);
  assert.equal(f.repo.state.loanerVersions.length, 3);
});
