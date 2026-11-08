import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ProcedureRegistry,
  InstrumentRegistry,
  ProcessingRegistry,
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
      code: "CLAMP",
      name: "Clamp",
      manufacturer: "",
      model: "",
    }),
    i = await ir.register(s, {
      requestId: randomUUID(),
      code: "INS",
      instrumentTypeId: type.id,
      serialNumber: "",
    }),
    pr = new ProcessingRegistry(repo),
    e = await pr.receive(s, {
      requestId: randomUUID(),
      code: "REC",
      source: "Demo",
      custodian: "Demo",
      condition: "Used",
      discrepancies: "",
      instrumentIds: [i.id],
      confirmed: true,
    });
  return { repo, s, type, i, e, pr, p: new ProcedureRegistry(repo) };
}
const draft = (f, extra = {}) => ({
  requestId: randomUUID(),
  code: "CLEAN-SOP",
  title: "Demo SOP",
  stage: "cleaning",
  method: "manual",
  instructions: "FICTIONAL ONLY\nPlaceholder instructions",
  source: "DEMO-SOURCE",
  instrumentTypeIds: [f.type.id],
  confirmed: true,
  ...extra,
});
const transition = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  reason: "Fictional reviewer decision",
  confirmed: true,
  ...extra,
});
const start = (p, version = 1, extra = {}) => ({
  requestId: randomUUID(),
  version,
  method: "manual",
  procedure: p.code,
  procedureVersion: String(p.revision),
  procedureRevisionId: p.id,
  equipment: "",
  confirmed: true,
  ...extra,
});
test("procedure revisions are immutable drafts, explicitly published/withdrawn, scoped and consecutively numbered", async () => {
  const f = await fixture(),
    b = draft(f),
    d = await f.p.draft(f.s, b);
  assert.equal(d.revision, 1);
  assert.deepEqual(await f.p.draft(f.s, b), d);
  assert.equal((await f.p.list(f.s, 1, "cleaning")).items.length, 0);
  const p = await f.p.transition(f.s, d.id, "publish", transition(1));
  assert.equal((await f.p.list(f.s, 1, "cleaning")).items[0].id, p.id);
  const next = await f.p.draft(
    f.s,
    draft(f, { instructions: "New fictional revision" }),
  );
  assert.equal(next.revision, 2);
  assert.equal((await f.p.get(f.s, p.id)).instructions, d.instructions);
  await f.p.transition(f.s, p.id, "withdraw", transition(2));
  assert.equal((await f.p.list(f.s, 1, "cleaning")).items.length, 0);
  assert.equal((await f.p.get(f.s, p.id, 2)).state, "published");
  await fail(f.p.transition(f.s, p.id, "publish", transition(3)), "CONFLICT");
  await fail(f.p.get({ ...f.s, facilityId: randomUUID() }, p.id), "NOT_FOUND");
});
test("cleaning and inspection save exact controlled snapshots; later withdrawal never rewrites prior evidence", async () => {
  const f = await fixture(),
    d = await f.p.draft(f.s, draft(f));
  await fail(f.pr.start(f.s, f.e.id, start(d)), "PROCEDURE_BLOCKED");
  const p = await f.p.transition(f.s, d.id, "publish", transition(1));
  let e = await f.pr.start(f.s, f.e.id, start(p));
  assert.deepEqual(e.attempts[0].controlledProcedure, p);
  await f.pr.finish(f.s, e.id, {
    requestId: randomUUID(),
    version: 2,
    outcome: "failed",
    evidence: "DEMO",
    note: "Simulated failure",
    confirmed: true,
  });
  await f.p.transition(f.s, p.id, "withdraw", transition(2));
  await fail(f.pr.start(f.s, e.id, start(p, 3)), "PROCEDURE_BLOCKED");
  assert.deepEqual(
    (await f.pr.get(f.s, e.id)).attempts[0].controlledProcedure,
    p,
  );
  const manual = { ...start(p, 3), procedure: "MANUAL", procedureVersion: "1" };
  delete manual.procedureRevisionId;
  await f.pr.start(f.s, e.id, manual);
  await f.pr.finish(f.s, e.id, {
    requestId: randomUUID(),
    version: 4,
    outcome: "passed",
    evidence: "DEMO",
    note: "",
    confirmed: true,
  });
  const insDraft = await f.p.draft(
      f.s,
      draft(f, { code: "INSPECT", stage: "inspection", method: "inspection" }),
    ),
    ins = await f.p.transition(f.s, insDraft.id, "publish", transition(1));
  e = await f.pr.inspect(f.s, e.id, {
    requestId: randomUUID(),
    version: 5,
    procedure: ins.code,
    procedureVersion: String(ins.revision),
    procedureRevisionId: ins.id,
    evidence: "DEMO",
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
  assert.deepEqual(e.inspections[0].controlledProcedure, ins);
  const { TraceabilityRegistry } = await import("../dist/index.js");
  const report = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "instrument",
    f.i.id,
  );
  assert.ok(JSON.stringify(report).includes("controlled_procedure"));
  assert.ok(JSON.stringify(report).includes("Placeholder instructions"));
});
test("controlled procedures reject mismatched stage/method/type/ref and invalid content without mutations", async () => {
  const f = await fixture();
  for (const patch of [
    { instructions: "" },
    { instructions: "bad\u0000text" },
    { instrumentTypeIds: [] },
    { stage: "unknown" },
    { stage: "inspection", method: "manual" },
    { confirmed: false },
  ])
    await fail(f.p.draft(f.s, draft(f, patch)), "INVALID_REQUEST");
  const d = await f.p.draft(f.s, draft(f)),
    p = await f.p.transition(f.s, d.id, "publish", transition(1)),
    before = structuredClone(f.repo.state);
  for (const patch of [
    { method: "mechanical", equipment: "Demo" },
    { procedure: "OTHER" },
    { procedureVersion: "999" },
  ])
    await fail(
      f.pr.start(f.s, f.e.id, start(p, 1, patch)),
      "PROCEDURE_BLOCKED",
    );
  const other = await new InstrumentRegistry(f.repo).createType(f.s, {
    requestId: randomUUID(),
    code: "OTHER",
    name: "Other",
    manufacturer: "",
    model: "",
  });
  const incompatible = await f.p.draft(
      f.s,
      draft(f, { code: "WRONG-TYPE", instrumentTypeIds: [other.id] }),
    ),
    pub = await f.p.transition(f.s, incompatible.id, "publish", transition(1));
  await fail(f.pr.start(f.s, f.e.id, start(pub)), "PROCEDURE_BLOCKED");
  assert.equal((await f.pr.get(f.s, f.e.id)).attempts.length, 0);
});
test("late publication audit failure and competing transitions preserve revision content and retry receipts", async () => {
  const f = await fixture(),
    d = await f.p.draft(f.s, draft(f)),
    b = transition(1),
    before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.p.transition(f.s, d.id, "publish", b));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const results = await Promise.allSettled([
    f.p.transition(f.s, d.id, "publish", b),
    f.p.transition(f.s, d.id, "publish", transition(1)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const p = await f.p.get(f.s, d.id);
  assert.deepEqual(await f.p.transition(f.s, d.id, "publish", b), p);
  assert.equal(p.instructions, d.instructions);
});
