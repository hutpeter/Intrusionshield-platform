import { independentInspector } from "./memory-repository.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  ProcessingRegistry,
  TrayRegistry,
  PackagingRegistry,
  CycleRegistry,
  ReviewRegistry,
  DistributionRegistry,
  RecallRegistry,
  ReturnRegistry,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const fail = (x, code) => assert.rejects(x, (e) => e.code === code);
const body = (a, extra = {}) => ({
  requestId: randomUUID(),
  code: "PACK-1",
  assemblyId: a.id,
  assemblyVersion: a.version,
  material: "DEMO WRAP",
  materialLot: "LOT-1",
  procedure: "PACK-DEMO",
  procedureVersion: "1",
  sealChecked: true,
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
async function fixture({ legacy = false, draft = false } = {}) {
  const repo = new MemoryRepository(),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    ir = new InstrumentRegistry(repo),
    pr = new ProcessingRegistry(repo),
    tr = new TrayRegistry(repo),
    pk = new PackagingRegistry(repo);
  const type = await ir.createType(s, {
    requestId: randomUUID(),
    code: "CLAMP",
    name: "Pinza",
    manufacturer: "",
    model: "",
  });
  const i = await ir.register(s, {
    requestId: randomUUID(),
    code: "INS-1",
    instrumentTypeId: type.id,
    serialNumber: "1",
  });
  let e;
  if (!legacy) {
    e = await pr.receive(s, {
      requestId: randomUUID(),
      code: "REC-1",
      source: "Demo",
      custodian: "Demo",
      condition: "Demo",
      discrepancies: "",
      instrumentIds: [i.id],
      confirmed: true,
    });
    await pr.start(s, e.id, {
      requestId: randomUUID(),
      version: 1,
      method: "manual",
      procedure: "CLEAN-DEMO",
      procedureVersion: "1",
      equipment: "",
      confirmed: true,
    });
    await pr.finish(s, e.id, {
      requestId: randomUUID(),
      version: 2,
      outcome: "passed",
      evidence: "CLEAN-EVID",
      note: "",
      confirmed: true,
    });
    e = await pr.inspect(independentInspector(s), e.id, {
      requestId: randomUUID(),
      version: 3,
      procedure: "INSPECT-DEMO",
      procedureVersion: "1",
      evidence: "INSP-EVID",
      confirmed: true,
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
    });
  }
  const d = await tr.createDefinition(s, {
    requestId: randomUUID(),
    code: "DEF-1",
    name: "Demo tray",
    requirements: [{ instrumentTypeId: type.id, quantity: 1 }],
  });
  let a = await tr.createAssembly(s, {
    requestId: randomUUID(),
    code: "ASM-1",
    definitionId: d.id,
    definitionVersion: 1,
  });
  a = await tr.updateContents(s, a.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: [i.id],
  });
  if (!draft)
    a = await tr.transition(s, a.id, {
      requestId: randomUUID(),
      version: 2,
      action: "complete",
      confirmed: true,
      reason: "",
    });
  const packageRecord = await pk.pack(s, body(a));
  return {
    repo,
    s,
    ir,
    pr,
    tr,
    pk,
    i,
    d,
    a,
    e,
    packageRecord,
    cy: new CycleRegistry(repo),
  };
}
const loadBody = (p, extra = {}) => ({
  requestId: randomUUID(),
  code: "LOAD-1",
  sterilizer: "STER-1",
  method: "steam",
  profile: "PROFILE-DEMO",
  profileVersion: "1",
  packageIds: [p.id],
  confirmed: true,
  ...extra,
});
const cycleStart = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  cycleReference: "MACHINE-CYCLE-1",
  confirmed: true,
  ...extra,
});
const result = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  outcome: "passed",
  cycleEvidence: "CYCLE-EVID-DEMO",
  indicatorEvidence: "INDICATOR-EVID-DEMO",
  note: "",
  confirmed: true,
  ...extra,
});
async function anotherPackage(f) {
  const code = randomUUID();
  const i = await f.ir.register(f.s, {
    requestId: randomUUID(),
    code: "INS-" + code,
    instrumentTypeId: f.i.instrumentTypeId,
    serialNumber: "",
  });
  const e = await f.pr.receive(f.s, {
    requestId: randomUUID(),
    code: "REC-" + code,
    source: "Demo",
    custodian: "Demo",
    condition: "Demo",
    discrepancies: "",
    instrumentIds: [i.id],
    confirmed: true,
  });
  await f.pr.start(f.s, e.id, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "DEMO",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  await f.pr.finish(f.s, e.id, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "DEMO",
    note: "",
    confirmed: true,
  });
  await f.pr.inspect(independentInspector(f.s), e.id, {
    requestId: randomUUID(),
    version: 3,
    procedure: "DEMO",
    procedureVersion: "1",
    evidence: "DEMO",
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
  let a = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "ASM-" + code,
    definitionId: f.d.id,
    definitionVersion: 1,
  });
  a = await f.tr.updateContents(f.s, a.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: [i.id],
  });
  a = await f.tr.transition(f.s, a.id, {
    requestId: randomUUID(),
    version: 2,
    action: "complete",
    confirmed: true,
    reason: "",
  });
  return f.pk.pack(f.s, body(a, { code: "PACK-" + code }));
}
async function reviewedFixture(outcome = "passed") {
  const f = await fixture(),
    l = await f.cy.create(f.s, loadBody(f.packageRecord));
  await f.cy.start(f.s, l.id, cycleStart(1));
  const done = await f.cy.finish(
    f.s,
    l.id,
    result(2, { outcome, note: outcome === "passed" ? "" : "Demo failure" }),
  );
  return {
    ...f,
    l: done,
    reviewer: { ...f.s, actorId: randomUUID() },
    rr: new ReviewRegistry(f.repo),
  };
}
const reviewBody = (l, extra = {}) => ({
  requestId: randomUUID(),
  loadId: l.id,
  loadVersion: l.version,
  reviewVersion: 0,
  decision: "release",
  reason: "Demo review decision",
  reference: "REVIEW-DEMO",
  cycleChecked: true,
  indicatorsChecked: true,
  packagesChecked: true,
  profileChecked: true,
  confirmed: true,
  ...extra,
});
async function distributionFixture(decision = "release") {
  const f = await reviewedFixture(),
    r = await f.rr.decide(f.reviewer, reviewBody(f.l, { decision }));
  return { ...f, r, dr: new DistributionRegistry(f.repo) };
}
const storeBody = (f, extra = {}) => ({
  requestId: randomUUID(),
  packageId: f.packageRecord.id,
  packageVersion: 1,
  reviewId: f.r?.id ?? randomUUID(),
  reviewVersion: 1,
  location: "STORE-A",
  reference: "STORAGE-DEMO",
  integrityChecked: true,
  confirmed: true,
  ...extra,
});
const issueBody = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  destination: "DEPARTMENT-DEMO",
  recipient: "RECEIVER-DEMO",
  reference: "HANDOVER-DEMO",
  integrityChecked: true,
  confirmed: true,
  ...extra,
});

const returnedBody = (d, extra = {}) => ({
  requestId: randomUUID(),
  code: "RETURN-1",
  distributionId: d.id,
  distributionVersion: d.version,
  condition: "used",
  location: "QUARANTINE-A",
  custodian: "DEMO-RETURNER",
  reference: "RETURN-REF",
  note: "",
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
const disposeBody = (extra = {}) => ({
  requestId: randomUUID(),
  version: 1,
  action: "reprocess",
  reason: "New complete processing required",
  reference: "DISPOSITION-REF",
  episodeCode: "REPROCESS-1",
  confirmed: true,
  ...extra,
});
async function issuedFixture() {
  const f = await distributionFixture(),
    stored = await f.dr.store(f.s, storeBody(f)),
    d = await f.dr.issue(f.s, stored.id, issueBody(1));
  return { ...f, d, rt: new ReturnRegistry(f.repo) };
}

async function finishAndPack(f, e, source, pack = true) {
  await f.pr.start(f.s, e.id, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "DEMO",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  await f.pr.finish(f.s, e.id, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "DEMO",
    note: "",
    confirmed: true,
  });
  await f.pr.inspect(independentInspector(f.s), e.id, {
    requestId: randomUUID(),
    version: 3,
    procedure: "DEMO",
    procedureVersion: "1",
    evidence: "DEMO",
    items: e.instruments.map((i) => ({
      instrumentId: i.id,
      clean: true,
      dry: true,
      intact: true,
      functional: true,
      note: "",
    })),
    confirmed: true,
  });
  const a = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "A-" + randomUUID(),
    definitionId: source.assemblySnapshot.definitionId,
    definitionVersion: source.assemblySnapshot.definitionRevision,
  });
  await f.tr.updateContents(f.s, a.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: e.instruments.map((i) => i.id),
  });
  const done = await f.tr.transition(f.s, a.id, {
    requestId: randomUUID(),
    version: 2,
    action: "complete",
    reason: "",
    confirmed: true,
  });
  return pack
    ? f.pk.pack(f.s, body(done, { code: "P-" + randomUUID() }))
    : done;
}
async function advance(f, source = f.packageRecord, d = f.d) {
  const rt = new ReturnRegistry(f.repo),
    ret = await rt.create(f.s, returnedBody(d, { code: "R-" + randomUUID() })),
    disp = await rt.dispose(
      f.reviewer,
      ret.id,
      disposeBody({ episodeCode: "E-" + randomUUID() }),
    ),
    e = await f.pr.get(f.s, disp.episodeId),
    p = await finishAndPack(f, e, source),
    l = await f.cy.create(f.s, loadBody(p, { code: "L-" + randomUUID() }));
  await f.cy.start(f.s, l.id, cycleStart(1, { cycleReference: randomUUID() }));
  const done = await f.cy.finish(f.s, l.id, result(2)),
    r = await f.rr.decide(f.reviewer, reviewBody(done)),
    stored = await f.dr.store(f.s, storeBody({ ...f, packageRecord: p, r }));
  return { p, e, d: stored, ret };
}
const recall = (source, plan, extra = {}) => ({
  requestId: randomUUID(),
  code: "RECALL-" + randomUUID(),
  sourceKind: "package",
  sourceId: source.id,
  sourceVersion: source.version,
  reason: "Demo ancestor recall",
  reference: "DEMO-RECALL",
  confirmed: true,
  ...(plan ? { impactHash: plan.impactHash } : {}),
  ...extra,
});
async function legacy(f, { closed = false } = {}) {
  const r = {
    tenantId: f.s.tenantId,
    facilityId: f.s.facilityId,
    id: randomUUID(),
    code: "LEGACY-" + randomUUID(),
    sourceKind: "package",
    sourceId: f.packageRecord.id,
    sourceCode: f.packageRecord.code,
    sourceVersion: 1,
    reason: "Original reason",
    reference: "Original reference",
    items: [
      {
        packageId: f.packageRecord.id,
        packageCode: f.packageRecord.code,
        packageVersion: 1,
        atRecall: null,
        status: closed ? "disposed" : "outstanding",
        recovery: closed
          ? {
              location: "OLD",
              reference: "OLD",
              note: "",
              actorId: f.s.actorId,
              at: new Date().toISOString(),
            }
          : null,
        disposition: closed
          ? {
              action: "quarantine",
              reason: "Original disposition",
              reference: "OLD",
              actorId: f.reviewer.actorId,
              at: new Date().toISOString(),
            }
          : null,
      },
    ],
    state: closed ? "closed" : "open",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: f.reviewer.actorId,
  };
  await f.repo.transaction(f.reviewer, async (tx) => {
    await tx.insertRecall(r);
    await tx.insertRecallVersion(r);
    await tx.insertRecallBlocks(r);
    await tx.appendAudit({
      id: randomUUID(),
      ...f.reviewer,
      entityId: r.id,
      version: 1,
      action: "recall-created",
      requestId: randomUUID(),
      at: r.createdAt,
      reason: r.reason,
    });
  });
  return r;
}
test("impact follows multiple return/reprocessing generations and excludes unrelated instruments", async () => {
  const f = await issuedFixture(),
    one = await advance(f),
    issued = await f.dr.issue(f.s, one.d.id, issueBody(1)),
    two = await advance(f, one.p, issued),
    healthy = await anotherPackage({ ...f, d: { id: f.a.definitionId } }),
    rc = new RecallRegistry(f.repo),
    before = structuredClone(f.repo.state),
    plan = await rc.impact(f.reviewer, "package", f.packageRecord.id, 1);
  assert.deepEqual(f.repo.state, before);
  assert.deepEqual(
    plan.items.map((p) => p.packageId).sort(),
    [f.packageRecord.id, one.p.id, two.p.id].sort(),
  );
  assert.equal(plan.instruments.length, 1);
  assert.equal(
    plan.items.find((p) => p.packageId === f.packageRecord.id).previousReturn
      .state,
    "reprocessing",
  );
  assert.equal(
    plan.items.find((p) => p.packageId === two.p.id).origin,
    "reprocessed",
  );
  assert.equal(
    plan.items.some((p) => p.packageId === healthy.id),
    false,
  );
  await fail(rc.create(f.reviewer, recall(f.packageRecord, null)), "CONFLICT");
  const saved = await rc.create(f.reviewer, recall(f.packageRecord, plan));
  assert.equal(saved.items.length, 3);
  await fail(f.dr.issue(f.s, two.d.id, issueBody(1)), "RECALL_BLOCKED");
  assert.equal((await f.rr.get(f.s, f.r.id)).state, "released");
  assert.equal((await f.pk.get(f.s, two.p.id)).recall.caseId, saved.id);
  assert.equal((await f.ir.get(f.s, f.i.id)).recall.caseId, saved.id);
  assert.equal((await f.pk.get(f.s, healthy.id)).recall, undefined);
});
test("a custody movement invalidates an earlier impact confirmation without leaving partial blocks", async () => {
  const f = await issuedFixture(),
    next = await advance(f),
    rc = new RecallRegistry(f.repo),
    plan = await rc.impact(f.reviewer, "package", f.packageRecord.id, 1);
  await f.dr.issue(f.s, next.d.id, issueBody(1));
  await fail(rc.create(f.reviewer, recall(f.packageRecord, plan)), "CONFLICT");
  assert.equal(f.repo.state.recalls.length, 0);
  assert.equal(f.repo.state.recallInstruments.length, 0);
  const fresh = await rc.impact(f.reviewer, "package", f.packageRecord.id, 1);
  assert.equal(
    fresh.items.find((p) => p.packageId === next.p.id).atRecall.state,
    "issued",
  );
  await rc.create(f.reviewer, recall(f.packageRecord, fresh));
});
test("current custody is held even when a later manual episode has no explicit return link", async () => {
  const f = await fixture();
  await f.pk.void(f.s, f.packageRecord.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
    confirmed: true,
  });
  await f.tr.transition(f.s, f.a.id, {
    requestId: randomUUID(),
    version: 3,
    action: "disassemble",
    reason: "Demo",
    confirmed: true,
  });
  const e = await f.pr.receive(f.s, {
      requestId: randomUUID(),
      code: "MANUAL",
      source: "Manual reprocessing",
      custodian: "Demo",
      condition: "Used",
      discrepancies: "",
      instrumentIds: [f.i.id],
      confirmed: true,
    }),
    p = await finishAndPack(f, e, f.packageRecord),
    rc = new RecallRegistry(f.repo),
    source = await f.pk.get(f.s, f.packageRecord.id),
    plan = await rc.impact(f.s, "package", source.id, source.version);
  assert.equal(
    plan.items.find((i) => i.packageId === p.id).origin,
    "current_custody",
  );
  await rc.create(f.s, recall(source, plan));
  assert.ok((await f.pk.get(f.s, p.id)).recall);
});
test("instrument recall prevents passed inspection from clearing holds but permits failed-inspection evidence", async () => {
  const f = await issuedFixture(),
    rt = new ReturnRegistry(f.repo),
    ret = await rt.create(f.s, returnedBody(f.d)),
    disp = await rt.dispose(f.reviewer, ret.id, disposeBody()),
    e = await f.pr.get(f.s, disp.episodeId);
  await f.pr.start(f.s, e.id, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "Demo",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  await f.pr.finish(f.s, e.id, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "Demo",
    note: "",
    confirmed: true,
  });
  const rc = new RecallRegistry(f.repo);
  await rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  const check = {
    requestId: randomUUID(),
    version: 3,
    procedure: "Demo",
    procedureVersion: "1",
    evidence: "Demo",
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
  };
  await fail(
    f.pr.inspect(independentInspector(f.s), e.id, check),
    "RECALL_BLOCKED",
  );
  assert.equal((await f.pr.get(f.s, e.id)).recallBlocked, true);
  assert.equal((await f.pr.get(f.s, e.id)).version, 3);
  assert.equal(
    (await f.repo.transaction(f.s, (tx) => tx.findProcessingHold(f.i.id)))
      .episodeId,
    e.id,
  );
  await f.pr.inspect(independentInspector(f.s), e.id, {
    ...check,
    requestId: randomUUID(),
    items: [{ ...check.items[0], clean: false, note: "Demo failed check" }],
  });
  assert.equal((await f.pr.get(f.s, e.id)).state, "inspection_failed");
});
test("extending a closed legacy case retains old disposition and versions, adds descendants and reopens recovery", async () => {
  const f = await issuedFixture(),
    next = await advance(f),
    old = await legacy(f, { closed: true }),
    rc = new RecallRegistry(f.repo),
    plan = await rc.caseImpact(f.reviewer, old.id),
    input = {
      requestId: randomUUID(),
      version: 1,
      impactHash: plan.impactHash,
      reason: "Extend to descendants",
      reference: "EXTENSION",
      confirmed: true,
    },
    r = await rc.extend(f.reviewer, old.id, input);
  assert.equal(r.state, "open");
  assert.equal(r.version, 2);
  assert.deepEqual(r.items[0], old.items[0]);
  assert.equal(
    r.items.find((i) => i.packageId === next.p.id).status,
    "outstanding",
  );
  assert.equal((await rc.get(f.s, old.id, 1)).state, "closed");
  assert.deepEqual(await rc.extend(f.reviewer, old.id, input), r);
  assert.equal(
    (await rc.history(f.s, old.id)).items[0].action,
    "recall-expanded",
  );
  assert.equal((await f.ir.get(f.s, f.i.id)).recall.caseId, old.id);
});
test("recall audit failures roll back descendant and instrument blocks; overlapping cases remain independent", async () => {
  const f = await issuedFixture(),
    next = await advance(f),
    rc = new RecallRegistry(f.repo),
    plan = await rc.impact(f.reviewer, "package", f.packageRecord.id, 1);
  f.repo.failAudit = true;
  await assert.rejects(rc.create(f.reviewer, recall(f.packageRecord, plan)));
  assert.equal(f.repo.state.recallBlocks.length, 0);
  assert.equal(f.repo.state.recallInstruments.length, 0);
  f.repo.failAudit = false;
  const r = await rc.create(f.reviewer, recall(f.packageRecord, plan)),
    again = await rc.create(
      f.reviewer,
      recall(
        f.packageRecord,
        await rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
      ),
    );
  assert.equal((await f.ir.get(f.s, f.i.id)).recall.count, 2);
  for (const item of r.items) {
    let current = await rc.get(f.s, r.id);
    await rc.recover(f.s, r.id, {
      requestId: randomUUID(),
      version: current.version,
      packageId: item.packageId,
      location: "Demo quarantine",
      reference: "Demo",
      note: "",
      confirmed: true,
    });
    current = await rc.get(f.s, r.id);
    await rc.dispose(f.reviewer, r.id, {
      requestId: randomUUID(),
      version: current.version,
      packageId: item.packageId,
      action: "quarantine",
      reason: "Demo",
      reference: "Demo",
      confirmed: true,
    });
  }
  assert.equal((await rc.get(f.s, r.id)).state, "closed");
  assert.equal((await f.ir.get(f.s, f.i.id)).recall.count, 2);
  assert.equal((await rc.get(f.s, again.id)).state, "open");
  assert.ok((await f.pk.get(f.s, next.p.id)).recall);
});
test("recall impact, extension and instrument holds are scoped and reject missing confirmations", async () => {
  const f = await issuedFixture(),
    rc = new RecallRegistry(f.repo);
  for (const other of [
    { ...f.s, tenantId: randomUUID() },
    { ...f.s, facilityId: randomUUID() },
  ]) {
    await fail(rc.impact(other, "package", f.packageRecord.id, 1), "NOT_FOUND");
    assert.equal(
      await f.repo.transaction(other, (tx) =>
        tx.findInstrumentRecallBlock(f.i.id),
      ),
      null,
    );
  }
  const old = await legacy(f);
  await fail(
    rc.extend(f.reviewer, old.id, {
      requestId: randomUUID(),
      version: 1,
      impactHash: "bad",
      reason: "Demo",
      reference: "Demo",
      confirmed: true,
    }),
    "CONFLICT",
  );
  await fail(
    rc.extend(f.reviewer, old.id, {
      requestId: randomUUID(),
      version: 1,
      impactHash: "bad",
      reason: "Demo",
      reference: "Demo",
      confirmed: false,
    }),
    "INVALID_REQUEST",
  );
});

test("assembly and packaging cannot bypass an instrument recall after passed inspection", async () => {
  const f = await issuedFixture(),
    rt = new ReturnRegistry(f.repo),
    ret = await rt.create(f.s, returnedBody(f.d)),
    disp = await rt.dispose(f.reviewer, ret.id, disposeBody()),
    e = await f.pr.get(f.s, disp.episodeId),
    a = await finishAndPack(f, e, f.packageRecord, false),
    rc = new RecallRegistry(f.repo);
  await rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  await fail(f.pk.pack(f.s, body(a, { code: "BYPASS" })), "RECALL_BLOCKED");
  await f.tr.transition(f.s, a.id, {
    requestId: randomUUID(),
    version: 3,
    action: "disassemble",
    reason: "Retain recall hold",
    confirmed: true,
  });
  const draft = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "BYPASS-ASM",
    definitionId: f.a.definitionId,
    definitionVersion: 1,
  });
  await fail(
    f.tr.updateContents(f.s, draft.id, {
      requestId: randomUUID(),
      version: 1,
      instrumentIds: [f.i.id],
    }),
    "RECALL_BLOCKED",
  );
  assert.ok((await f.ir.get(f.s, f.i.id)).recall);
});
test("racing package creation either invalidates preview or is denied by the committed recall", async () => {
  for (const recallFirst of [false, true]) {
    const f = await issuedFixture(),
      rt = new ReturnRegistry(f.repo),
      ret = await rt.create(f.s, returnedBody(f.d)),
      disp = await rt.dispose(f.reviewer, ret.id, disposeBody()),
      e = await f.pr.get(f.s, disp.episodeId),
      a = await finishAndPack(f, e, f.packageRecord, false),
      rc = new RecallRegistry(f.repo),
      plan = await rc.impact(f.reviewer, "package", f.packageRecord.id, 1);
    const tasks = recallFirst
      ? [
          () => rc.create(f.reviewer, recall(f.packageRecord, plan)),
          () => f.pk.pack(f.s, body(a, { code: "RACE" })),
        ]
      : [
          () => f.pk.pack(f.s, body(a, { code: "RACE" })),
          () => rc.create(f.reviewer, recall(f.packageRecord, plan)),
        ];
    const out = await Promise.allSettled(tasks.map((task) => task()));
    assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      out.find((x) => x.status === "rejected").reason.code,
      recallFirst ? "RECALL_BLOCKED" : "CONFLICT",
    );
    if (!recallFirst) {
      const saved = await rc.create(
        f.reviewer,
        recall(
          f.packageRecord,
          await rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
        ),
      );
      assert.equal(saved.items.length, 2);
    }
  }
});
test("extension audit failure restores the legacy version and leaves descendants and instrument blocks unchanged", async () => {
  const f = await issuedFixture(),
    next = await advance(f),
    old = await legacy(f),
    rc = new RecallRegistry(f.repo),
    plan = await rc.caseImpact(f.reviewer, old.id),
    before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(
    rc.extend(f.reviewer, old.id, {
      requestId: randomUUID(),
      version: 1,
      impactHash: plan.impactHash,
      reason: "Extend",
      reference: "Demo",
      confirmed: true,
    }),
  );
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  assert.equal((await f.pk.get(f.s, next.p.id)).recall, undefined);
});

test("oversized recall impact fails explicitly with no partial case or instrument block", async () => {
  const f = await issuedFixture(),
    repo = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            traceRows: async (kind) =>
              kind === "package"
                ? Array.from({ length: 1001 }, () => ({
                    kind,
                    current: true,
                    record: f.packageRecord,
                  }))
                : [],
          }),
        ),
    },
    rc = new RecallRegistry(repo);
  await fail(
    rc.create(f.reviewer, recall(f.packageRecord, null)),
    "RECALL_LIMIT",
  );
  assert.equal(f.repo.state.recalls.length, 0);
  assert.equal(f.repo.state.recallInstruments.length, 0);
});
