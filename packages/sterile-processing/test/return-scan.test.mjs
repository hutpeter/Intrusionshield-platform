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
    e = await pr.inspect(s, e.id, {
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
  await f.pr.inspect(f.s, e.id, {
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
const token = (f) =>
  `RSP-P-${f.packageRecord.id.toUpperCase()}-V${f.packageRecord.version}`;
const scannedBody = (f, extra = {}) => ({
  ...returnedBody(f.d),
  identifier: token(f),
  receivedInstrumentIds: f.a.instruments.map((i) => i.id),
  ...extra,
});
test("return scan is scoped/read-only and retrieves original issue plus complete manifest", async () => {
  const f = await issuedFixture(),
    before = structuredClone(f.repo.state),
    s = await f.rt.scan(f.s, token(f));
  assert.equal(s.issue.id, f.d.id);
  assert.equal(s.issue.state, "issued");
  assert.equal(s.manifest[0].id, f.i.id);
  assert.equal(s.recall, null);
  assert.deepEqual(f.repo.state, before);
  await fail(
    f.rt.scan({ ...f.s, facilityId: randomUUID() }, token(f)),
    "NOT_FOUND",
  );
});
test("scanned return freezes identifier/contents and original handover while remaining unavailable", async () => {
  const f = await issuedFixture(),
    input = scannedBody(f),
    r = await f.rt.createScanned(f.s, input);
  assert.equal(r.state, "returned");
  assert.equal(r.disposition, null);
  assert.equal(r.episodeId, null);
  assert.deepEqual(r.issue, f.d);
  assert.equal(r.scanReceipt.identifier, token(f));
  assert.deepEqual(r.scanReceipt.contents, f.a.instruments);
  assert.deepEqual(await f.rt.createScanned(f.s, input), r);
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).returned.id, r.id);
  assert.equal((await f.dr.get(f.s, f.d.id)).state, "issued");
  const progressed = await f.rt.dispose(f.reviewer, r.id, disposeBody());
  assert.equal(progressed.state, "reprocessing");
  assert.deepEqual(progressed.scanReceipt, r.scanReceipt);
  assert.equal(
    (await f.pr.get(f.s, progressed.episodeId)).returnSource.returnId,
    r.id,
  );
});
test("missing, extra, duplicate or mismatched contents cannot create a complete scanned return", async () => {
  const f = await issuedFixture();
  for (const ids of [
    [],
    [randomUUID()],
    [f.i.id, randomUUID()],
    [f.i.id, f.i.id],
  ])
    await fail(
      f.rt.createScanned(f.s, scannedBody(f, { receivedInstrumentIds: ids })),
      "RETURN_CONTENTS_MISMATCH",
    );
  await fail(
    f.rt.createScanned(
      f.s,
      scannedBody(f, { identifier: `RSP-P-${randomUUID()}-V1` }),
    ),
    "CONFLICT",
  );
  await fail(
    f.rt.createScanned(f.s, scannedBody(f, { contentsChecked: false })),
    "INVALID_REQUEST",
  );
  assert.equal(f.repo.state.returns.length, 0);
});
test("not-issued, stale and already-returned package scans are rejected", async () => {
  const f = await issuedFixture();
  await fail(f.rt.scan(f.s, token(f).replace("-V1", "-V2")), "CONFLICT");
  await fail(f.rt.scan(f.s, "RSP-I-" + f.i.id), "INVALID_REQUEST");
  await f.rt.createScanned(f.s, scannedBody(f));
  await fail(f.rt.scan(f.s, token(f)), "RETURN_BLOCKED");
  await fail(
    f.rt.createScanned(f.s, scannedBody(f, { code: "SECOND" })),
    "CONFLICT",
  );
  const g = await distributionFixture();
  await fail(new ReturnRegistry(g.repo).scan(g.s, token(g)), "RETURN_BLOCKED");
});
test("recalled issued package can return but recall persists and prevents reprocessing", async () => {
  const f = await issuedFixture();
  await new RecallRegistry(f.repo).create(f.reviewer, {
    requestId: randomUUID(),
    code: "RECALL",
    sourceKind: "package",
    sourceId: f.packageRecord.id,
    sourceVersion: 1,
    reason: "Demo",
    reference: "Demo",
    confirmed: true,
  });
  assert.ok((await f.rt.scan(f.s, token(f))).recall);
  const r = await f.rt.createScanned(f.s, scannedBody(f));
  await fail(f.rt.dispose(f.reviewer, r.id, disposeBody()), "RECALL_BLOCKED");
  assert.equal((await f.rt.get(f.s, r.id)).state, "returned");
});
test("late audit rollback and competing scanned returns preserve one complete record", async () => {
  const f = await issuedFixture(),
    before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.rt.createScanned(f.s, scannedBody(f)));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const results = await Promise.allSettled([
    f.rt.createScanned(f.s, scannedBody(f)),
    f.rt.createScanned(f.s, scannedBody(f, { code: "OTHER" })),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.repo.state.returns.length, 1);
});
