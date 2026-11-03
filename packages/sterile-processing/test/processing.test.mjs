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
