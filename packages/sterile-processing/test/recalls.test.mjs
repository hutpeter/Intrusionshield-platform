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
async function recallFixture() {
  const f = await distributionFixture(),
    d = await f.dr.store(f.s, storeBody(f));
  return { ...f, d, rc: new RecallRegistry(f.repo) };
}
const recallBody = (f, extra = {}) => ({
  requestId: randomUUID(),
  code: "RECALL-1",
  sourceKind: "package",
  sourceId: f.packageRecord.id,
  sourceVersion: f.packageRecord.version,
  reason: "Fictional recall",
  reference: "RECALL-DEMO",
  confirmed: true,
  ...extra,
});
const recovery = (f, version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  packageId: f.packageRecord.id,
  location: "QUARANTINE-A",
  reference: "RECOVERY-DEMO",
  note: "",
  confirmed: true,
  ...extra,
});
const disposition = (f, version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  packageId: f.packageRecord.id,
  action: "quarantine",
  reason: "Fictional disposition",
  reference: "DISPOSITION-DEMO",
  confirmed: true,
  ...extra,
});
test("recall captures stored location and blocks issue without changing original release or movement history", async () => {
  const f = await recallFixture(),
    r = await f.rc.create(f.reviewer, recallBody(f));
  assert.equal(r.items[0].atRecall.location, "STORE-A");
  await fail(f.dr.issue(f.s, f.d.id, issueBody(1)), "RECALL_BLOCKED");
  assert.equal((await f.dr.get(f.s, f.d.id)).state, "stored");
  assert.equal((await f.dr.get(f.s, f.d.id)).recall.caseId, r.id);
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).recall.count, 1);
  assert.equal((await f.rr.get(f.s, f.r.id)).state, "released");
  assert.equal((await f.rr.get(f.s, f.r.id)).recallBlocked, true);
  assert.equal((await f.rc.get(f.s, r.id, 1)).items[0].status, "outstanding");
});
test("recall locates issued destination and recipient; recovery preserves original handover evidence", async () => {
  const f = await recallFixture();
  await f.dr.issue(f.s, f.d.id, issueBody(1));
  const r = await f.rc.create(f.reviewer, recallBody(f));
  assert.equal(r.items[0].atRecall.state, "issued");
  assert.equal(r.items[0].atRecall.destination, "DEPARTMENT-DEMO");
  assert.equal(r.items[0].atRecall.recipient, "RECEIVER-DEMO");
  const recovered = await f.rc.recover(f.s, r.id, recovery(f, 1));
  assert.equal(recovered.items[0].recovery.location, "QUARANTINE-A");
  assert.equal(recovered.items[0].recovery.actorId, f.s.actorId);
  assert.equal((await f.dr.get(f.s, f.d.id)).state, "issued");
  assert.equal((await f.dr.get(f.s, f.d.id)).events.length, 2);
});
test("disposition requires recovery and case closure never lifts recall block or validates old labels", async () => {
  const f = await recallFixture(),
    r = await f.rc.create(f.reviewer, recallBody(f));
  await fail(f.rc.dispose(f.reviewer, r.id, disposition(f, 1)), "CONFLICT");
  await f.rc.recover(f.s, r.id, recovery(f, 1));
  const done = await f.rc.dispose(f.reviewer, r.id, disposition(f, 2));
  assert.equal(done.state, "closed");
  assert.equal(done.items[0].status, "disposed");
  await fail(f.dr.issue(f.s, f.d.id, issueBody(1)), "RECALL_BLOCKED");
  assert.equal((await f.rr.get(f.s, f.r.id)).recallBlocked, true);
  await fail(
    f.pk.void(f.s, f.packageRecord.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    }),
    "RECALL_BLOCKED",
  );
  assert.equal((await f.rc.get(f.s, r.id, 1)).state, "open");
  assert.equal((await f.rc.history(f.s, r.id)).items.length, 3);
});
test("overlapping cases remain independent and never remove another case block", async () => {
  const f = await recallFixture(),
    a = await f.rc.create(f.reviewer, recallBody(f)),
    b = await f.rc.create(
      f.reviewer,
      recallBody(f, {
        code: "RECALL-2",
        sourceKind: "load",
        sourceId: f.l.id,
        sourceVersion: f.l.version,
      }),
    );
  await f.rc.recover(f.s, a.id, recovery(f, 1));
  await f.rc.dispose(f.reviewer, a.id, disposition(f, 2));
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).recall.count, 2);
  assert.equal((await f.rc.get(f.s, b.id)).state, "open");
  await fail(f.dr.issue(f.s, f.d.id, issueBody(1)), "RECALL_BLOCKED");
});
test("recall enforces source versions, explicit confirmations, target membership and idempotent commands", async () => {
  const f = await recallFixture();
  for (const extra of [{ confirmed: false }, { reason: "" }, { reference: "" }])
    await fail(
      f.rc.create(f.reviewer, recallBody(f, extra)),
      "INVALID_REQUEST",
    );
  await fail(
    f.rc.create(f.reviewer, recallBody(f, { sourceVersion: 2 })),
    "CONFLICT",
  );
  const body = recallBody(f),
    r = await f.rc.create(f.reviewer, body);
  assert.deepEqual(await f.rc.create(f.reviewer, body), r);
  await fail(
    f.rc.create(f.reviewer, { ...body, reason: "Changed" }),
    "CONFLICT",
  );
  await fail(f.rc.recover(f.s, r.id, recovery(f, 2)), "CONFLICT");
  await fail(
    f.rc.recover(f.s, r.id, recovery(f, 1, { packageId: randomUUID() })),
    "INVALID_REQUEST",
  );
  await fail(
    f.rc.recover(f.s, r.id, recovery(f, 1, { confirmed: false })),
    "INVALID_REQUEST",
  );
});
test("recall audit failures roll back blocks, recovery and disposition snapshots", async () => {
  const f = await recallFixture(),
    body = recallBody(f);
  f.repo.failAudit = true;
  await assert.rejects(f.rc.create(f.reviewer, body));
  f.repo.failAudit = false;
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).recall, undefined);
  assert.equal((await f.rc.list(f.s)).items.length, 0);
  const r = await f.rc.create(f.reviewer, body);
  f.repo.failAudit = true;
  await assert.rejects(f.rc.recover(f.s, r.id, recovery(f, 1)));
  f.repo.failAudit = false;
  assert.equal((await f.rc.get(f.s, r.id)).items[0].status, "outstanding");
  await f.rc.recover(f.s, r.id, recovery(f, 1));
  f.repo.failAudit = true;
  await assert.rejects(f.rc.dispose(f.reviewer, r.id, disposition(f, 2)));
  f.repo.failAudit = false;
  assert.equal((await f.rc.get(f.s, r.id)).items[0].status, "recovered");
  await fail(f.rc.get(f.s, r.id, 3), "NOT_FOUND");
});
test("case records, versions, blocks and mutations remain scoped to tenant and facility", async () => {
  const f = await recallFixture(),
    r = await f.rc.create(f.reviewer, recallBody(f));
  for (const s of [
    { ...f.reviewer, facilityId: randomUUID() },
    { ...f.reviewer, tenantId: randomUUID() },
  ]) {
    assert.equal((await f.rc.list(s)).items.length, 0);
    await fail(f.rc.get(s, r.id), "NOT_FOUND");
    await fail(f.rc.get(s, r.id, 1), "NOT_FOUND");
    await fail(f.rc.history(s, r.id), "NOT_FOUND");
    await fail(f.rc.create(s, recallBody(f)), "NOT_FOUND");
    await fail(f.rc.recover(s, r.id, recovery(f, 1)), "NOT_FOUND");
  }
});
test("a whole-load recall blocks every member and prevents starting its drafted cycle", async () => {
  const f = await fixture(),
    second = await anotherPackage(f),
    l = await f.cy.create(
      f.s,
      loadBody(f.packageRecord, {
        packageIds: [f.packageRecord.id, second.id],
      }),
    ),
    rc = new RecallRegistry(f.repo),
    r = await rc.create(
      { ...f.s, actorId: randomUUID() },
      recallBody(f, { sourceKind: "load", sourceId: l.id, sourceVersion: 1 }),
    );
  assert.equal(r.items.length, 2);
  for (const p of [f.packageRecord, second])
    assert.ok((await f.pk.get(f.s, p.id)).recall);
  await fail(f.cy.start(f.s, l.id, cycleStart(1)), "RECALL_BLOCKED");
});
test("a held review cannot release a recalled package even after all review checks are confirmed", async () => {
  const f = await distributionFixture("hold"),
    rc = new RecallRegistry(f.repo);
  await rc.create(f.reviewer, recallBody(f));
  await fail(
    f.rr.decide(f.reviewer, reviewBody(f.l, { reviewVersion: 1 })),
    "RECALL_BLOCKED",
  );
  assert.equal((await f.rr.get(f.s, f.r.id)).state, "held");
});
