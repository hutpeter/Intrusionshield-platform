import { independentInspector } from "./memory-repository.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ProcessingRegistry,
  InstrumentRegistry,
  TrayRegistry,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const scope = () => ({
  tenantId: randomUUID(),
  facilityId: randomUUID(),
  actorId: randomUUID(),
});
export const receipt = (id, extra = {}) => ({
  requestId: randomUUID(),
  code: "REC-001",
  source: "Quirófano demo",
  custodian: "Entrega demo",
  condition: "Usado — ficticio",
  discrepancies: "",
  instrumentIds: [id],
  confirmed: true,
  ...extra,
});
const start = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  method: "manual",
  procedure: "SOP-DEMO",
  procedureVersion: "1",
  equipment: "",
  confirmed: true,
  ...extra,
});
const finish = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  outcome: "passed",
  evidence: "EVID-DEMO",
  note: "",
  confirmed: true,
  ...extra,
});
async function fixture() {
  const repo = new MemoryRepository(),
    s = scope(),
    ir = new InstrumentRegistry(repo),
    pr = new ProcessingRegistry(repo),
    tr = new TrayRegistry(repo);
  const type = await ir.createType(s, {
    requestId: randomUUID(),
    code: "PINZA",
    name: "Pinza",
    manufacturer: "",
    model: "",
  });
  const i = await ir.register(s, {
    requestId: randomUUID(),
    code: "INS-1",
    instrumentTypeId: type.id,
    serialNumber: "DEMO",
  });
  const d = await tr.createDefinition(s, {
    requestId: randomUUID(),
    code: "TRAY",
    name: "Tray",
    requirements: [{ instrumentTypeId: type.id, quantity: 1 }],
  });
  return { repo, s, ir, pr, tr, i, d };
}
const fails = (promise, code) =>
  assert.rejects(promise, (e) => e.code === code);
test("receiving holds instruments; successful cleaning retains hold and immutable evidence pending inspection", async () => {
  const f = await fixture();
  let e = await f.pr.receive(f.s, receipt(f.i.id));
  assert.equal(e.state, "received");
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold.episodeId, e.id);
  e = await f.pr.start(f.s, e.id, start(1));
  e = await f.pr.finish(f.s, e.id, finish(2));
  assert.equal(e.state, "awaiting_inspection");
  assert.equal(e.attempts[0].startedBy, f.s.actorId);
  assert.equal(e.attempts[0].finishedBy, f.s.actorId);
  assert.equal((await f.pr.get(f.s, e.id, 1)).attempts.length, 0);
  assert.equal((await f.pr.get(f.s, e.id, 2)).attempts[0].outcome, null);
  assert.equal((await f.pr.history(f.s, e.id)).items.length, 3);
  await fails(
    f.ir.retire(f.s, f.i.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Test",
    }),
    "PROCESSING_HOLD",
  );
  await fails(f.pr.start(f.s, e.id, start(3)), "CONFLICT");
});
test("failed cleaning preserves evidence and attribution through a successful retry", async () => {
  const f = await fixture();
  let e = await f.pr.receive(f.s, receipt(f.i.id));
  e = await f.pr.start(f.s, e.id, start(1));
  e = await f.pr.finish(
    f.s,
    e.id,
    finish(2, { outcome: "failed", note: "Residuo visible" }),
  );
  assert.equal(e.state, "cleaning_failed");
  const original = structuredClone(e.attempts[0]);
  e = await f.pr.start(
    f.s,
    e.id,
    start(3, { method: "mechanical", equipment: "WASHER-DEMO" }),
  );
  e = await f.pr.finish(f.s, e.id, finish(4));
  assert.equal(e.attempts.length, 2);
  assert.deepEqual(e.attempts[0], original);
  assert.equal(e.attempts[1].number, 2);
  assert.equal((await f.pr.get(f.s, e.id, 3)).state, "cleaning_failed");
});
test("rejects missing evidence, procedure version, failure reason, confirmation and illegal transitions", async () => {
  const f = await fixture();
  await fails(
    f.pr.receive(f.s, receipt(f.i.id, { confirmed: false })),
    "INVALID_REQUEST",
  );
  let e = await f.pr.receive(f.s, receipt(f.i.id));
  await fails(f.pr.finish(f.s, e.id, finish(1)), "CONFLICT");
  await fails(
    f.pr.start(f.s, e.id, start(1, { procedureVersion: "" })),
    "INVALID_REQUEST",
  );
  await fails(
    f.pr.start(f.s, e.id, start(1, { method: "mechanical" })),
    "INVALID_REQUEST",
  );
  await fails(
    f.pr.start(f.s, e.id, start(1, { confirmed: false })),
    "INVALID_REQUEST",
  );
  e = await f.pr.start(f.s, e.id, start(1));
  await fails(
    f.pr.finish(f.s, e.id, finish(2, { evidence: "" })),
    "INVALID_REQUEST",
  );
  await fails(
    f.pr.finish(f.s, e.id, finish(2, { outcome: "failed", note: "" })),
    "INVALID_REQUEST",
  );
  assert.equal((await f.pr.get(f.s, e.id)).version, 2);
});
test("excludes active tray members from receipt, and held members from assembly", async () => {
  const f = await fixture();
  const a = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "ASM",
    definitionId: f.d.id,
    definitionVersion: 1,
  });
  await f.tr.updateContents(f.s, a.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: [f.i.id],
  });
  await fails(f.pr.receive(f.s, receipt(f.i.id)), "INSTRUMENT_ASSIGNED");
  await f.tr.transition(f.s, a.id, {
    requestId: randomUUID(),
    version: 2,
    action: "disassemble",
    confirmed: true,
    reason: "Dummy",
  });
  await f.pr.receive(f.s, receipt(f.i.id));
  const b = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "ASM-2",
    definitionId: f.d.id,
    definitionVersion: 1,
  });
  await fails(
    f.tr.updateContents(f.s, b.id, {
      requestId: randomUUID(),
      version: 1,
      instrumentIds: [f.i.id],
    }),
    "PROCESSING_HOLD",
  );
});
test("idempotent retries return original results; changed payload and stale versions conflict", async () => {
  const f = await fixture(),
    body = receipt(f.i.id);
  const e = await f.pr.receive(f.s, body);
  assert.deepEqual(await f.pr.receive(f.s, body), e);
  await fails(f.pr.receive(f.s, { ...body, source: "Changed" }), "CONFLICT");
  const command = start(1);
  const x = await f.pr.start(f.s, e.id, command);
  assert.deepEqual(await f.pr.start(f.s, e.id, command), x);
  await fails(f.pr.start(f.s, e.id, start(1)), "CONFLICT");
  await fails(
    f.pr.receive(f.s, receipt(f.i.id, { code: "REC-2" })),
    "PROCESSING_HOLD",
  );
});
test("receipt, reservation, version and retry receipt roll back together when audit fails", async () => {
  const f = await fixture(),
    body = receipt(f.i.id);
  f.repo.failAudit = true;
  await assert.rejects(f.pr.receive(f.s, body));
  f.repo.failAudit = false;
  assert.equal((await f.pr.list(f.s)).items.length, 0);
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold, undefined);
  const e = await f.pr.receive(f.s, body);
  f.repo.failAudit = true;
  await assert.rejects(f.pr.start(f.s, e.id, start(1)));
  f.repo.failAudit = false;
  assert.equal((await f.pr.get(f.s, e.id)).state, "received");
  await fails(f.pr.get(f.s, e.id, 2), "NOT_FOUND");
});
test("rejects retired, missing, duplicate, over-limit or cross-scope instruments atomically", async () => {
  const f = await fixture();
  await fails(
    f.pr.receive(f.s, receipt(f.i.id, { instrumentIds: [f.i.id, f.i.id] })),
    "INVALID_REQUEST",
  );
  await fails(
    f.pr.receive(
      f.s,
      receipt(f.i.id, {
        instrumentIds: Array.from({ length: 101 }, () => randomUUID()),
      }),
    ),
    "INVALID_REQUEST",
  );
  await fails(
    f.pr.receive(
      f.s,
      receipt(f.i.id, { instrumentIds: [f.i.id, randomUUID()] }),
    ),
    "NOT_FOUND",
  );
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold, undefined);
  await fails(
    f.pr.receive({ ...f.s, facilityId: randomUUID() }, receipt(f.i.id)),
    "NOT_FOUND",
  );
  await f.ir.retire(f.s, f.i.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Dummy damage",
  });
  await fails(f.pr.receive(f.s, receipt(f.i.id)), "CONFLICT");
});
test("scopes all reads, versions and history by tenant and facility", async () => {
  const f = await fixture(),
    e = await f.pr.receive(f.s, receipt(f.i.id));
  for (const s of [
    { ...f.s, tenantId: randomUUID() },
    { ...f.s, facilityId: randomUUID() },
  ]) {
    assert.equal((await f.pr.list(s)).items.length, 0);
    await fails(f.pr.get(s, e.id), "NOT_FOUND");
    await fails(f.pr.get(s, e.id, 1), "NOT_FOUND");
    await fails(f.pr.history(s, e.id), "NOT_FOUND");
    await fails(f.pr.start(s, e.id, start(1)), "NOT_FOUND");
  }
});
const inspectionInput = (i, version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  procedure: "INSPECT-DEMO",
  procedureVersion: "1",
  evidence: "INSPECT-EVID-DEMO",
  confirmed: true,
  items: [
    {
      instrumentId: i,
      clean: true,
      dry: true,
      intact: true,
      functional: true,
      note: "",
    },
  ],
  ...extra,
});
async function cleaned(f) {
  let e = await f.pr.receive(f.s, receipt(f.i.id));
  await f.pr.start(f.s, e.id, start(1));
  return f.pr.finish(f.s, e.id, finish(2));
}
test("inspection releases holds only after a complete pass and permits assembly without altering prior versions", async () => {
  const f = await fixture(),
    e = await cleaned(f),
    body = inspectionInput(f.i.id, 3);
  const passed = await f.pr.inspect(independentInspector(f.s), e.id, body);
  assert.equal(passed.state, "ready_for_assembly");
  assert.equal(
    passed.inspections[0].actorId,
    independentInspector(f.s).actorId,
  );
  assert.equal(passed.inspections[0].cleaningAttempt, 1);
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold, undefined);
  assert.equal((await f.pr.get(f.s, e.id, 3)).inspections.length, 0);
  const a = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "INSPECTED-TRAY",
    definitionId: f.d.id,
    definitionVersion: 1,
  });
  await f.tr.updateContents(f.s, a.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: [f.i.id],
  });
  assert.deepEqual(
    await f.pr.inspect(independentInspector(f.s), e.id, body),
    passed,
  );
  await fails(
    f.pr.inspect(independentInspector(f.s), e.id, inspectionInput(f.i.id, 4)),
    "CONFLICT",
  );
});
test("failed inspection retains hold; re-cleaning and reinspection preserve the original defect", async () => {
  const f = await fixture(),
    e = await cleaned(f);
  const body = inspectionInput(f.i.id, 3);
  body.items[0].dry = false;
  body.items[0].note = "Demo moisture";
  let x = await f.pr.inspect(independentInspector(f.s), e.id, body);
  assert.equal(x.state, "inspection_failed");
  assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  await fails(
    f.pr.inspect(independentInspector(f.s), e.id, inspectionInput(f.i.id, 4)),
    "CONFLICT",
  );
  await f.pr.start(f.s, e.id, start(4));
  await f.pr.finish(f.s, e.id, finish(5));
  x = await f.pr.inspect(
    independentInspector(f.s),
    e.id,
    inspectionInput(f.i.id, 6),
  );
  assert.equal(x.inspections.length, 2);
  assert.equal(x.inspections[0].items[0].note, "Demo moisture");
  assert.equal(x.inspections[1].cleaningAttempt, 2);
  assert.equal((await f.pr.get(f.s, e.id, 4)).state, "inspection_failed");
});
test("inspection rejects incomplete, foreign, duplicated and non-boolean checks, missing evidence or failure reason", async () => {
  const f = await fixture(),
    e = await cleaned(f);
  for (const patch of [
    { items: [] },
    {
      items: [
        { ...inspectionInput(f.i.id, 3).items[0], instrumentId: randomUUID() },
      ],
    },
    {
      items: [
        ...inspectionInput(f.i.id, 3).items,
        ...inspectionInput(f.i.id, 3).items,
      ],
    },
    { items: [{ ...inspectionInput(f.i.id, 3).items[0], dry: "true" }] },
    { items: [{ ...inspectionInput(f.i.id, 3).items[0], intact: false }] },
    { evidence: "" },
    { confirmed: false },
  ])
    await fails(
      f.pr.inspect(
        independentInspector(f.s),
        e.id,
        inspectionInput(f.i.id, 3, patch),
      ),
      "INVALID_REQUEST",
    );
  assert.equal((await f.pr.get(f.s, e.id)).version, 3);
  await fails(
    f.pr.inspect(
      { ...f.s, facilityId: randomUUID() },
      e.id,
      inspectionInput(f.i.id, 3),
    ),
    "NOT_FOUND",
  );
});
test("inspection audit failure restores hold and version; stale and changed idempotent commands cannot pass", async () => {
  const f = await fixture(),
    e = await cleaned(f),
    body = inspectionInput(f.i.id, 3);
  f.repo.failAudit = true;
  await assert.rejects(f.pr.inspect(independentInspector(f.s), e.id, body));
  f.repo.failAudit = false;
  assert.equal((await f.pr.get(f.s, e.id)).state, "awaiting_inspection");
  assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  await fails(f.pr.get(f.s, e.id, 4), "NOT_FOUND");
  await f.pr.inspect(independentInspector(f.s), e.id, body);
  await fails(
    f.pr.inspect(independentInspector(f.s), e.id, {
      ...body,
      evidence: "Different",
    }),
    "CONFLICT",
  );
  await fails(
    f.pr.inspect(independentInspector(f.s), e.id, inspectionInput(f.i.id, 3)),
    "CONFLICT",
  );
});
test("inspection of a whole group cannot release one item while another fails", async () => {
  const f = await fixture();
  const second = await f.ir.register(f.s, {
    requestId: randomUUID(),
    code: "INS-2",
    instrumentTypeId: f.i.instrumentTypeId,
    serialNumber: "",
  });
  const e = await f.pr.receive(
    f.s,
    receipt(f.i.id, { instrumentIds: [f.i.id, second.id] }),
  );
  await f.pr.start(f.s, e.id, start(1));
  await f.pr.finish(f.s, e.id, finish(2));
  const body = inspectionInput(f.i.id, 3);
  body.items.push({
    ...body.items[0],
    instrumentId: second.id,
    functional: false,
    note: "Demo defect",
  });
  const x = await f.pr.inspect(independentInspector(f.s), e.id, body);
  assert.equal(x.state, "inspection_failed");
  for (const i of [f.i, second])
    assert.equal((await f.ir.get(f.s, i.id)).processingHold.episodeId, e.id);
});
test("replayed inspection cannot release a hold belonging to a newer processing episode", async () => {
  const f = await fixture(),
    e = await cleaned(f),
    body = inspectionInput(f.i.id, 3);
  await f.pr.inspect(independentInspector(f.s), e.id, body);
  const next = await f.pr.receive(f.s, receipt(f.i.id, { code: "REC-NEW" }));
  await f.pr.inspect(independentInspector(f.s), e.id, body);
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold.episodeId, next.id);
});
test("episodes saved before inspection arrays existed remain readable and inspectable", async () => {
  const f = await fixture(),
    e = await cleaned(f);
  delete f.repo.state.processing.find((x) => x.id === e.id).inspections;
  assert.equal((await f.pr.get(f.s, e.id)).state, "awaiting_inspection");
  const x = await f.pr.inspect(
    independentInspector(f.s),
    e.id,
    inspectionInput(f.i.id, 3),
  );
  assert.equal(x.inspections.length, 1);
});

test("independent inspection denies cleaner account and alias person without changing state, audit, receipts or holds", async () => {
  const f = await fixture();
  f.s.personId = randomUUID();
  const e = await cleaned(f),
    before = structuredClone(f.repo.state);
  for (const inspector of [f.s, { ...f.s, actorId: randomUUID() }])
    await fails(
      f.pr.inspect(inspector, e.id, inspectionInput(f.i.id, 3)),
      "SELF_INSPECTION",
    );
  assert.deepEqual(f.repo.state, before);
  const inspector = independentInspector(f.s),
    body = inspectionInput(f.i.id, 3),
    saved = await f.pr.inspect(inspector, e.id, body);
  assert.equal(saved.inspections[0].personId, inspector.personId);
  assert.equal(saved.attempts[0].startedByPersonId, f.s.personId);
  assert.deepEqual(await f.pr.inspect(inspector, e.id, body), saved);
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold, undefined);
});
test("start and finish participants across every failed/retried cleaning attempt are disqualified", async () => {
  const f = await fixture();
  f.s.personId = randomUUID();
  const finisher = { ...f.s, actorId: randomUUID(), personId: randomUUID() },
    retryCleaner = { ...f.s, actorId: randomUUID(), personId: randomUUID() };
  let e = await f.pr.receive(f.s, receipt(f.i.id));
  e = await f.pr.start(f.s, e.id, start(1));
  e = await f.pr.finish(
    finisher,
    e.id,
    finish(2, { outcome: "failed", note: "Fictional failure" }),
  );
  e = await f.pr.start(retryCleaner, e.id, start(3));
  e = await f.pr.finish(retryCleaner, e.id, finish(4));
  for (const person of [f.s, finisher, retryCleaner])
    await fails(
      f.pr.inspect(
        { ...person, actorId: randomUUID() },
        e.id,
        inspectionInput(f.i.id, 5),
      ),
      "SELF_INSPECTION",
    );
  assert.equal((await f.pr.get(f.s, e.id)).version, 5);
  assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  const saved = await f.pr.inspect(
    independentInspector(f.s),
    e.id,
    inspectionInput(f.i.id, 5),
  );
  assert.equal(saved.inspections[0].outcome, "passed");
  assert.equal(
    (await f.pr.get(f.s, e.id, 2)).attempts[0].startedByPersonId,
    f.s.personId,
  );
});
test("an inspector who subsequently cleans cannot inspect again, and earlier inspection evidence remains immutable", async () => {
  const f = await fixture();
  f.s.personId = randomUUID();
  const e = await cleaned(f),
    inspector = independentInspector(f.s);
  const failed = await f.pr.inspect(
    inspector,
    e.id,
    inspectionInput(f.i.id, 3, {
      items: [
        {
          instrumentId: f.i.id,
          clean: false,
          dry: true,
          intact: true,
          functional: true,
          note: "Fictional failure",
        },
      ],
    }),
  );
  await f.pr.start(inspector, e.id, start(failed.version));
  await f.pr.finish(inspector, e.id, finish(failed.version + 1));
  await fails(
    f.pr.inspect(inspector, e.id, inspectionInput(f.i.id, failed.version + 2)),
    "SELF_INSPECTION",
  );
  assert.equal(
    (await f.pr.get(f.s, e.id, failed.version)).inspections[0].personId,
    inspector.personId,
  );
  assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
});
test("missing historical cleaning person evidence fails closed rather than inferring a person from current account mappings", async () => {
  const f = await fixture(),
    e = await cleaned(f),
    legacy = f.repo.state.processing.find((x) => x.id === e.id);
  delete legacy.attempts[0].startedByPersonId;
  const before = structuredClone(f.repo.state);
  await fails(
    f.pr.inspect(independentInspector(f.s), e.id, inspectionInput(f.i.id, 3)),
    "INSPECTION_IDENTITY_REQUIRED",
  );
  assert.deepEqual(f.repo.state, before);
});
test("concurrent independent inspectors cannot save two decisions or lose retained person attribution", async () => {
  const f = await fixture(),
    e = await cleaned(f),
    first = independentInspector(f.s),
    second = { ...first, actorId: randomUUID(), personId: randomUUID() };
  const results = await Promise.allSettled(
    [first, second].map((s) =>
      f.pr.inspect(s, e.id, inspectionInput(f.i.id, 3)),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.filter(
      (r) => r.status === "rejected" && r.reason.code === "CONFLICT",
    ).length,
    1,
  );
  assert.equal((await f.pr.get(f.s, e.id)).inspections.length, 1);
});

const receiptCorrection = (old, patch = {}) => ({
  requestId: randomUUID(),
  version: old.version,
  source: "Corrected source",
  custodian: old.custodian,
  condition: old.condition,
  discrepancies: old.discrepancies,
  reason: "Fictional entry correction",
  reference: "SIMULATED-CORRECTION",
  confirmed: true,
  ...patch,
});
test("receipt correction preserves original identity, contents and holds with versioned attributed evidence", async () => {
  const f = await fixture(),
    old = await f.pr.receive(f.s, receipt(f.i.id)),
    reviewer = { ...f.s, actorId: randomUUID(), personId: randomUUID() },
    hold = (await f.ir.get(f.s, f.i.id)).processingHold,
    body = receiptCorrection(old);
  const saved = await f.pr.correctReceipt(reviewer, old.id, body);
  assert.equal(saved.version, 2);
  assert.equal(saved.state, "received");
  assert.equal(saved.source, "Corrected source");
  for (const key of [
    "id",
    "code",
    "createdAt",
    "receivedBy",
    "instruments",
    "attempts",
    "inspections",
  ])
    assert.deepEqual(saved[key], old[key]);
  assert.deepEqual((await f.ir.get(f.s, f.i.id)).processingHold, hold);
  assert.equal((await f.pr.get(f.s, old.id, 1)).source, old.source);
  assert.equal(saved.receiptCorrections[0].previousVersion, 1);
  assert.equal(saved.receiptCorrections[0].personId, reviewer.personId);
  const audit = (await f.pr.history(f.s, old.id)).items.find(
    (e) => e.action === "receipt-corrected",
  );
  assert.equal(audit.actorId, reviewer.actorId);
  assert.ok(audit.reason.includes("SIMULATED-CORRECTION"));
  assert.deepEqual(await f.pr.correctReceipt(reviewer, old.id, body), saved);
  await f.pr.start(f.s, old.id, start(2));
  await f.pr.correctReceipt(reviewer, old.id, body);
  assert.equal((await f.pr.get(f.s, old.id)).state, "cleaning");
  await fails(
    f.pr.correctReceipt(
      reviewer,
      old.id,
      receiptCorrection(saved, { version: 3, source: "Too late" }),
    ),
    "RECEIPT_CORRECTION_BLOCKED",
  );
});
test("invalid, no-op, stale and foreign-scope corrections cannot change any receipt or hold", async () => {
  const f = await fixture(),
    old = await f.pr.receive(f.s, receipt(f.i.id)),
    before = structuredClone(f.repo.state);
  for (const patch of [
    { reason: "" },
    { reference: "" },
    { confirmed: false },
    { source: old.source },
    { custodian: "" },
  ])
    await fails(
      f.pr.correctReceipt(f.s, old.id, receiptCorrection(old, patch)),
      "INVALID_REQUEST",
    );
  await fails(
    f.pr.correctReceipt(f.s, old.id, receiptCorrection(old, { version: 2 })),
    "CONFLICT",
  );
  await fails(
    f.pr.correctReceipt(
      { ...f.s, facilityId: randomUUID() },
      old.id,
      receiptCorrection(old),
    ),
    "NOT_FOUND",
  );
  assert.deepEqual(f.repo.state, before);
});
test("receipt correction audit failure rolls back current record, snapshots, receipt and holds before successful retry", async () => {
  const f = await fixture(),
    old = await f.pr.receive(f.s, receipt(f.i.id)),
    before = structuredClone(f.repo.state),
    body = receiptCorrection(old);
  const broken = new ProcessingRegistry({
    transaction: (scope, work) =>
      f.repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw new Error("simulated correction audit failure");
          },
        }),
      ),
  });
  await assert.rejects(
    () => broken.correctReceipt(f.s, old.id, body),
    /simulated/,
  );
  assert.deepEqual(f.repo.state, before);
  assert.equal((await f.pr.correctReceipt(f.s, old.id, body)).version, 2);
});
test("concurrent correction and cleaning start have one winner with no lost receipt evidence", async () => {
  const f = await fixture(),
    old = await f.pr.receive(f.s, receipt(f.i.id));
  const results = await Promise.allSettled([
    f.pr.correctReceipt(
      { ...f.s, actorId: randomUUID() },
      old.id,
      receiptCorrection(old),
    ),
    f.pr.start(f.s, old.id, start(1)),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    results.filter(
      (x) => x.status === "rejected" && x.reason.code === "CONFLICT",
    ).length,
    1,
  );
  const current = await f.pr.get(f.s, old.id);
  assert.equal(current.version, 2);
  assert.ok((await f.ir.get(f.s, f.i.id)).processingHold);
  assert.equal((await f.pr.get(f.s, old.id, 1)).source, old.source);
});
