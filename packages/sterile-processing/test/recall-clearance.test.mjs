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

const clearBody = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  resolution: "SIMULATED resolved cause",
  evidence: "SIMULATED-RESOLUTION",
  procedure: "SIMULATED-REPROCESS",
  procedureVersion: "1",
  causeReviewed: true,
  recoveryReviewed: true,
  dispositionReviewed: true,
  reprocessingRequired: true,
  confirmed: true,
  ...extra,
});
const admitBody = (r, plan, extra = {}) => ({
  requestId: randomUUID(),
  version: r.version,
  impactHash: plan.impactHash,
  episodeCode: "NEW-RECALL-" + randomUUID(),
  custodian: "Demo operator",
  location: "DEMO-NEW-RECEIVING",
  condition: "Held for fresh processing",
  reference: "READMISSION-DEMO",
  note: "",
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
async function closeCase(f, r, action = "reprocess_required") {
  for (const item of r.items) {
    r = await f.rc.recover(f.s, r.id, {
      requestId: randomUUID(),
      version: r.version,
      packageId: item.packageId,
      location: "DEMO-QUARANTINE",
      reference: "SIMULATED-RECONCILIATION",
      note: "Fictional history reconciliation",
      confirmed: true,
    });
    r = await f.rc.dispose(f.reviewer, r.id, {
      requestId: randomUUID(),
      version: r.version,
      packageId: item.packageId,
      action,
      reason: "Reviewed disposition",
      reference: "SIMULATED-DISPOSITION",
      confirmed: true,
    });
  }
  return r;
}
async function clearanceFixture() {
  const f = await issuedFixture(),
    next = await advance(f);
  f.rc = new RecallRegistry(f.repo);
  const impact = await f.rc.impact(
      f.reviewer,
      "package",
      f.packageRecord.id,
      1,
    ),
    r = await f.rc.create(f.reviewer, recall(f.packageRecord, impact));
  return { ...f, next, r: await closeCase(f, r) };
}
test("clearance retains old package/label blocks and requires fresh receiving, cleaning and inspection", async () => {
  const f = await clearanceFixture(),
    before = structuredClone(f.r),
    cleared = await f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version));
  assert.equal(cleared.clearance.actorId, f.reviewer.actorId);
  assert.equal(cleared.state, "closed");
  assert.deepEqual(cleared.items, before.items);
  assert.ok((await f.ir.get(f.s, f.i.id)).recall);
  assert.equal(
    (await f.rc.get(f.s, f.r.id)).readmission.pendingInstrumentIds.length,
    1,
  );
  const plan = await f.rc.admissionPlan(f.s, f.r.id);
  assert.equal(plan.ready, true);
  assert.equal(plan.instruments.length, 1);
  const admitted = await f.rc.admit(f.s, f.r.id, admitBody(cleared, plan)),
    episodeId = admitted.admissions[0].episodeId,
    e = await f.pr.get(f.s, episodeId);
  assert.equal(e.state, "received");
  assert.equal(e.attempts.length, 0);
  assert.equal(e.receivedBy, f.s.actorId);
  assert.equal(e.recallSource.caseId, f.r.id);
  assert.equal((await f.ir.get(f.s, f.i.id)).recall, undefined);
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold.episodeId, e.id);
  assert.equal(
    (await f.rc.get(f.s, f.r.id)).readmission.pendingInstrumentIds.length,
    0,
  );
  assert.ok((await f.pk.get(f.s, f.next.p.id)).recall);
  assert.equal(
    (
      await f.rr.get(
        f.s,
        (
          await f.repo.transaction(f.s, (tx) =>
            tx.findReviewByLoad(f.next.d.loadId),
          )
        ).id,
      )
    ).recallBlocked,
    true,
  );
  await fail(
    f.cy.create(f.s, loadBody(f.next.p, { code: "OLD-REUSE" })),
    "RECALL_BLOCKED",
  );
  const a = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "FRESH-ASM",
    definitionId: f.a.definitionId,
    definitionVersion: 1,
  });
  await fail(
    f.tr.updateContents(f.s, a.id, {
      requestId: randomUUID(),
      version: 1,
      instrumentIds: [f.i.id],
    }),
    "PROCESSING_HOLD",
  );
  const p = await finishAndPack(f, e, f.next.p);
  assert.equal(p.inspectionProofs[0].episodeId, e.id);
  assert.equal((await f.pk.get(f.s, p.id)).recall, undefined);
  assert.equal((await f.rc.get(f.s, f.r.id, f.r.version)).clearance, undefined);
  assert.equal(
    (await f.rc.get(f.s, f.r.id, cleared.version)).admissions,
    undefined,
  );
  // A new incident follows the clearance-created episode, not only return-created episodes.
  const impact = await f.rc.impact(
    f.reviewer,
    "package",
    f.packageRecord.id,
    1,
  );
  assert.equal(
    impact.items.find((i) => i.packageId === p.id).origin,
    "reprocessed",
  );
});
test("clearance requires closed reprocessing dispositions, evidence, checks, current version and legacy upgrade", async () => {
  const f = await clearanceFixture();
  for (const extra of [
    { confirmed: false },
    { causeReviewed: false },
    { recoveryReviewed: false },
    { dispositionReviewed: false },
    { reprocessingRequired: false },
    { evidence: "" },
  ])
    await fail(
      f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version, extra)),
      "INVALID_REQUEST",
    );
  await fail(f.rc.clear(f.reviewer, f.r.id, clearBody(1)), "CONFLICT");
  const legacyCase = await legacy(f);
  await fail(
    f.rc.clear(f.reviewer, legacyCase.id, clearBody(1)),
    "CLEARANCE_BLOCKED",
  );
  const g = await issuedFixture();
  g.rc = new RecallRegistry(g.repo);
  let r = await g.rc.create(
    g.reviewer,
    recall(
      g.packageRecord,
      await g.rc.impact(g.reviewer, "package", g.packageRecord.id, 1),
    ),
  );
  await fail(
    g.rc.clear(g.reviewer, r.id, clearBody(r.version)),
    "CLEARANCE_BLOCKED",
  );
  r = await closeCase(g, r, "quarantine");
  await fail(
    g.rc.clear(g.reviewer, r.id, clearBody(r.version)),
    "CLEARANCE_BLOCKED",
  );
});
test("overlapping recalls all need clearance, and one admission covers their matching instrument restrictions", async () => {
  const f = await clearanceFixture();
  let other = await f.rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await f.rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  other = await closeCase(f, other);
  const a = await f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version));
  let plan = await f.rc.admissionPlan(f.s, a.id);
  assert.equal(plan.ready, false);
  assert.equal(plan.blockedCases[0].id, other.id);
  await fail(f.rc.admit(f.s, a.id, admitBody(a, plan)), "CLEARANCE_BLOCKED");
  await f.rc.clear(f.reviewer, other.id, clearBody(other.version));
  plan = await f.rc.admissionPlan(f.s, a.id);
  assert.equal(plan.clearances.length, 2);
  await f.rc.admit(f.s, a.id, admitBody(a, plan));
  assert.equal((await f.ir.get(f.s, f.i.id)).recall, undefined);
  assert.equal(
    (await f.rc.get(f.s, other.id)).readmission.pendingInstrumentIds.length,
    0,
  );
  assert.equal((await f.pk.get(f.s, f.next.p.id)).recall.count, 2);
});
test("a later recall admission supersedes paused processing evidence without deleting its history", async () => {
  const f = await clearanceFixture(),
    a = await f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version)),
    first = await f.rc.admit(
      f.s,
      a.id,
      admitBody(a, await f.rc.admissionPlan(f.s, a.id)),
    ),
    oldEpisode = await f.pr.get(f.s, first.admissions[0].episodeId);
  let b = await f.rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await f.rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  b = await closeCase(f, b);
  b = await f.rc.clear(f.reviewer, b.id, clearBody(b.version));
  const plan = await f.rc.admissionPlan(f.s, b.id);
  assert.ok(plan.episodes.some((e) => e.id === oldEpisode.id));
  const next = await f.rc.admit(f.s, b.id, admitBody(b, plan)),
    newId = next.admissions[0].episodeId;
  assert.equal((await f.pr.get(f.s, oldEpisode.id)).state, "superseded");
  assert.equal((await f.pr.get(f.s, oldEpisode.id)).supersededBy, newId);
  assert.equal((await f.pr.get(f.s, oldEpisode.id, 1)).state, "received");
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold.episodeId, newId);
});
test("running cleaning cannot be superseded by readmission", async () => {
  const f = await clearanceFixture(),
    a = await f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version)),
    first = await f.rc.admit(
      f.s,
      a.id,
      admitBody(a, await f.rc.admissionPlan(f.s, a.id)),
    ),
    e = await f.pr.get(f.s, first.admissions[0].episodeId);
  await f.pr.start(f.s, e.id, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "Demo",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  let b = await f.rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await f.rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  b = await closeCase(f, b);
  b = await f.rc.clear(f.reviewer, b.id, clearBody(b.version));
  const plan = await f.rc.admissionPlan(f.s, b.id);
  assert.equal(plan.ready, false);
  assert.ok(plan.activeCleaning.includes(e.code));
  await fail(f.rc.admit(f.s, b.id, admitBody(b, plan)), "CLEARANCE_BLOCKED");
  assert.equal((await f.pr.get(f.s, e.id)).state, "cleaning");
});
test("clearance and admission audit failures roll back all decisions, custody transfers and gate rows", async () => {
  const f = await clearanceFixture();
  let before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version)));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const c = await f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version)),
    plan = await f.rc.admissionPlan(f.s, c.id);
  before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.rc.admit(f.s, c.id, admitBody(c, plan)));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  assert.ok((await f.ir.get(f.s, f.i.id)).recall);
});
test("scope, confirmations, stale versions and idempotent retries cannot bypass admission", async () => {
  const f = await clearanceFixture();
  for (const other of [
    { ...f.s, tenantId: randomUUID() },
    { ...f.s, facilityId: randomUUID() },
  ]) {
    await fail(f.rc.clear(other, f.r.id, clearBody(f.r.version)), "NOT_FOUND");
    await fail(f.rc.admissionPlan(other, f.r.id), "NOT_FOUND");
  }
  const input = clearBody(f.r.version),
    c = await f.rc.clear(f.reviewer, f.r.id, input);
  assert.deepEqual(await f.rc.clear(f.reviewer, f.r.id, input), c);
  const plan = await f.rc.admissionPlan(f.s, c.id);
  await fail(
    f.rc.admit(f.s, c.id, admitBody(c, plan, { contentsChecked: false })),
    "INVALID_REQUEST",
  );
  await fail(
    f.rc.admit(f.s, c.id, admitBody(c, plan, { impactHash: "stale" })),
    "CONFLICT",
  );
  const body = admitBody(c, plan),
    a = await f.rc.admit(f.s, c.id, body);
  assert.deepEqual(await f.rc.admit(f.s, c.id, body), a);
  await fail(
    f.rc.extend(f.reviewer, c.id, {
      requestId: randomUUID(),
      version: a.version,
      impactHash: "anything",
      reason: "Change",
      reference: "Demo",
      confirmed: true,
    }),
    "CONFLICT",
  );
});
test("competing clearance and admission commands accept one transition without duplicate episodes", async () => {
  const f = await clearanceFixture(),
    decisions = await Promise.allSettled([
      f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version)),
      f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version)),
    ]);
  assert.equal(decisions.filter((x) => x.status === "fulfilled").length, 1);
  const c = decisions.find((x) => x.status === "fulfilled").value,
    plan = await f.rc.admissionPlan(f.s, c.id),
    out = await Promise.allSettled([
      f.rc.admit(f.s, c.id, admitBody(c, plan)),
      f.rc.admit(f.s, c.id, admitBody(c, plan)),
    ]);
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(f.repo.state.recallReadmissions.length, 1);
});

test("a mixed package moves every co-member into fresh processing rather than freeing unrelated instruments", async () => {
  const f = await issuedFixture(),
    rt = new ReturnRegistry(f.repo),
    ret = await rt.create(f.s, returnedBody(f.d)),
    disp = await rt.dispose(f.reviewer, ret.id, disposeBody()),
    e = await f.pr.get(f.s, disp.episodeId),
    a = await finishAndPack(f, e, f.packageRecord, false),
    healthy = await anotherPackage({ ...f, d: { id: f.a.definitionId } }),
    h = healthy.assemblySnapshot.instruments[0];
  await f.pk.void(f.s, healthy.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo grouping",
    confirmed: true,
  });
  await f.tr.transition(f.s, healthy.assemblyId, {
    requestId: randomUUID(),
    version: healthy.assemblyVersion,
    action: "disassemble",
    reason: "Demo grouping",
    confirmed: true,
  });
  await f.tr.transition(f.s, a.id, {
    requestId: randomUUID(),
    version: a.version,
    action: "disassemble",
    reason: "Demo grouping",
    confirmed: true,
  });
  const def = await f.tr.createDefinition(f.s, {
      requestId: randomUUID(),
      code: "MIXED",
      name: "Mixed tray",
      requirements: [{ instrumentTypeId: f.i.instrumentTypeId, quantity: 2 }],
    }),
    draft = await f.tr.createAssembly(f.s, {
      requestId: randomUUID(),
      code: "MIXED-ASM",
      definitionId: def.id,
      definitionVersion: 1,
    });
  await f.tr.updateContents(f.s, draft.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: [f.i.id, h.id],
  });
  const done = await f.tr.transition(f.s, draft.id, {
      requestId: randomUUID(),
      version: 2,
      action: "complete",
      reason: "",
      confirmed: true,
    }),
    p = await f.pk.pack(f.s, body(done, { code: "MIXED-PACK" }));
  f.rc = new RecallRegistry(f.repo);
  let r = await f.rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await f.rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  assert.equal(r.lineage.instrumentIds.length, 1);
  assert.ok(r.items.some((i) => i.packageId === p.id));
  assert.equal((await f.ir.get(f.s, h.id)).recall, undefined);
  r = await closeCase(f, r);
  r = await f.rc.clear(f.reviewer, r.id, clearBody(r.version));
  const plan = await f.rc.admissionPlan(f.s, r.id);
  assert.equal(plan.instruments.length, 2);
  const result = await f.rc.admit(f.s, r.id, admitBody(r, plan)),
    newId = result.admissions[0].episodeId;
  assert.equal((await f.pr.get(f.s, newId)).instruments.length, 2);
  assert.equal((await f.ir.get(f.s, h.id)).processingHold.episodeId, newId);
  assert.equal((await f.ir.get(f.s, f.i.id)).processingHold.episodeId, newId);
});
test("a new overlapping case invalidates admission readiness and requires a fresh confirmed plan", async () => {
  const f = await clearanceFixture(),
    c = await f.rc.clear(f.reviewer, f.r.id, clearBody(f.r.version)),
    plan = await f.rc.admissionPlan(f.s, c.id);
  let other = await f.rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await f.rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  await fail(f.rc.admit(f.s, c.id, admitBody(c, plan)), "CLEARANCE_BLOCKED");
  other = await closeCase(f, other);
  await f.rc.clear(f.reviewer, other.id, clearBody(other.version));
  await fail(f.rc.admit(f.s, c.id, admitBody(c, plan)), "CONFLICT");
  assert.equal(f.repo.state.recallReadmissions.length, 0);
  await f.rc.admit(
    f.s,
    c.id,
    admitBody(c, await f.rc.admissionPlan(f.s, c.id)),
  );
});

test("a running sterilization cycle prevents admission until its outcome is explicitly recorded", async () => {
  const f = await fixture();
  f.reviewer = { ...f.s, actorId: randomUUID() };
  f.rc = new RecallRegistry(f.repo);
  const load = await f.cy.create(f.s, loadBody(f.packageRecord));
  await f.cy.start(f.s, load.id, cycleStart(1));
  let r = await f.rc.create(
    f.reviewer,
    recall(
      f.packageRecord,
      await f.rc.impact(f.reviewer, "package", f.packageRecord.id, 1),
    ),
  );
  r = await closeCase(f, r);
  r = await f.rc.clear(f.reviewer, r.id, clearBody(r.version));
  const plan = await f.rc.admissionPlan(f.s, r.id);
  assert.equal(plan.ready, false);
  assert.ok(plan.activeCycles.includes(load.code));
  await fail(f.rc.admit(f.s, r.id, admitBody(r, plan)), "CLEARANCE_BLOCKED");
  assert.equal(f.repo.state.recallReadmissions.length, 0);
  await f.cy.finish(
    f.s,
    load.id,
    result(2, { outcome: "aborted", note: "SIMULATED recorded abort" }),
  );
  assert.equal((await f.rc.admissionPlan(f.s, r.id)).ready, true);
});
