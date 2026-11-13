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
test("return retains original issue and release while current projections block old labels and loading", async () => {
  const f = await issuedFixture(),
    r = await f.rt.create(f.s, returnedBody(f.d));
  assert.equal(r.issue.destination, "DEPARTMENT-DEMO");
  assert.equal(r.issue.recipient, "RECEIVER-DEMO");
  assert.equal(r.state, "returned");
  assert.deepEqual(await f.dr.get(f.s, f.d.id, 2), f.d);
  assert.equal((await f.dr.get(f.s, f.d.id)).returned.id, r.id);
  assert.equal((await f.rr.get(f.s, f.r.id)).returnBlocked, true);
  assert.equal((await f.rr.get(f.s, f.r.id)).state, "released");
  assert.equal((await f.rr.get(f.s, f.r.id, 1)).returnBlocked, undefined);
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).returned.id, r.id);
  await fail(
    f.pk.void(f.s, f.packageRecord.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "bypass",
      confirmed: true,
    }),
    "RETURN_BLOCKED",
  );
  await fail(
    f.cy.create(f.s, loadBody(f.packageRecord, { code: "LOAD-NEW" })),
    "RETURN_BLOCKED",
  );
});
test("reviewer reprocessing atomically closes old assembly and creates linked received episode and holds", async () => {
  const f = await issuedFixture(),
    r = await f.rt.create(f.s, returnedBody(f.d)),
    done = await f.rt.dispose(f.reviewer, r.id, disposeBody());
  assert.equal(done.state, "reprocessing");
  const e = await f.pr.get(f.s, done.episodeId);
  assert.equal(e.state, "received");
  assert.equal(e.receivedBy, f.reviewer.actorId);
  assert.equal(e.returnSource.returnId, r.id);
  assert.equal(e.instruments[0].id, f.i.id);
  assert.equal(e.attempts.length, 0);
  assert.equal(
    (await f.tr.assembly(f.s, f.a.id)).assembly.state,
    "disassembled",
  );
  assert.equal(
    (await f.tr.assembly(f.s, f.a.id, f.a.version)).assembly.state,
    "complete",
  );
  const hold = await f.repo.transaction(f.s, (tx) =>
    tx.findProcessingHold(f.i.id),
  );
  assert.equal(hold.episodeId, e.id);
  assert.equal(
    await f.repo.transaction(f.s, (tx) => tx.findActiveAssignment(f.i.id)),
    null,
  );
  const fresh = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "NEW-A",
    definitionId: f.a.definitionId,
    definitionVersion: 1,
  });
  await fail(
    f.tr.updateContents(f.s, fresh.id, {
      requestId: randomUUID(),
      version: 1,
      instrumentIds: [f.i.id],
    }),
    "PROCESSING_HOLD",
  );
  await f.pr.start(f.s, e.id, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "CLEAN",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  assert.equal((await f.pr.get(f.s, e.id)).state, "cleaning");
  await f.pr.finish(f.s, e.id, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "NEW-CLEANING",
    note: "",
    confirmed: true,
  });
  await f.pr.inspect(independentInspector(f.s), e.id, {
    requestId: randomUUID(),
    version: 3,
    procedure: "NEW-INSPECT",
    procedureVersion: "1",
    evidence: "NEW-EVIDENCE",
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
  await f.tr.updateContents(f.s, fresh.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: [f.i.id],
  });
  const complete = await f.tr.transition(f.s, fresh.id, {
    requestId: randomUUID(),
    version: 2,
    action: "complete",
    reason: "",
    confirmed: true,
  });
  const next = await f.pk.pack(f.s, body(complete, { code: "NEW-PACKAGE" }));
  assert.equal(next.inspectionProofs[0].episodeId, e.id);
  assert.notEqual(next.id, f.packageRecord.id);

  assert.equal((await f.rt.get(f.s, r.id, 1)).state, "returned");
  assert.equal((await f.rt.history(f.s, r.id)).items.length, 2);
  assert.equal(
    (await f.pk.get(f.s, f.packageRecord.id)).returned.state,
    "reprocessing",
  );
});
test("unopened returns cannot silently restock; quarantine retains instrument reservations", async () => {
  const f = await issuedFixture(),
    r = await f.rt.create(f.s, returnedBody(f.d, { condition: "unopened" })),
    q = await f.rt.dispose(
      f.reviewer,
      r.id,
      disposeBody({ action: "quarantine", episodeCode: "" }),
    );
  assert.equal(q.state, "quarantined");
  assert.equal(q.episodeId, null);
  assert.equal((await f.tr.assembly(f.s, f.a.id)).assembly.state, "complete");
  assert.equal(
    (await f.repo.transaction(f.s, (tx) => tx.findActiveAssignment(f.i.id)))
      .assemblyId,
    f.a.id,
  );
  await fail(
    f.rt.dispose(f.reviewer, r.id, disposeBody({ version: 2 })),
    "CONFLICT",
  );
});
test("damaged and recalled returns remain held; no reprocessing bypass", async () => {
  for (const damaged of [true, false]) {
    const f = await issuedFixture(),
      r = await f.rt.create(
        f.s,
        returnedBody(f.d, { condition: damaged ? "damaged" : "used" }),
      );
    if (!damaged)
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
    await fail(
      f.rt.dispose(f.reviewer, r.id, disposeBody()),
      damaged ? "RETURN_BLOCKED" : "RECALL_BLOCKED",
    );
    assert.equal((await f.rt.get(f.s, r.id)).state, "returned");
    assert.equal((await f.tr.assembly(f.s, f.a.id)).assembly.state, "complete");
  }
});
test("returns require issued source, current version, complete contents and confirmation; duplicate and retry rules", async () => {
  const storedFixture = await distributionFixture(),
    stored = await storedFixture.dr.store(
      storedFixture.s,
      storeBody(storedFixture),
    );
  await fail(
    new ReturnRegistry(storedFixture.repo).create(
      storedFixture.s,
      returnedBody(stored),
    ),
    "CONFLICT",
  );
  const f = await issuedFixture();
  for (const extra of [
    { contentsChecked: false },
    { confirmed: false },
    { condition: "invalid" },
  ])
    await fail(f.rt.create(f.s, returnedBody(f.d, extra)), "INVALID_REQUEST");
  await fail(
    f.rt.create(f.s, returnedBody(f.d, { distributionVersion: 1 })),
    "CONFLICT",
  );
  const b = returnedBody(f.d),
    r = await f.rt.create(f.s, b);
  assert.deepEqual(await f.rt.create(f.s, b), r);
  await fail(
    f.rt.create(f.s, returnedBody(f.d, { code: "RETURN-2" })),
    "CONFLICT",
  );
  await fail(
    f.rt.dispose(f.reviewer, r.id, disposeBody({ confirmed: false })),
    "INVALID_REQUEST",
  );
  await fail(
    f.rt.dispose(f.reviewer, r.id, disposeBody({ version: 2 })),
    "CONFLICT",
  );
});
test("audit failure rolls back return and all reprocessing reservation transfers and snapshots", async () => {
  const f = await issuedFixture();
  f.repo.failAudit = true;
  await assert.rejects(f.rt.create(f.s, returnedBody(f.d)));
  assert.equal(f.repo.state.returns.length, 0);
  f.repo.failAudit = false;
  const r = await f.rt.create(f.s, returnedBody(f.d)),
    before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.rt.dispose(f.reviewer, r.id, disposeBody()));
  assert.deepEqual(f.repo.state, before);
});
test("foreign scopes cannot read returns, history, source issue or create new processing", async () => {
  const f = await issuedFixture(),
    r = await f.rt.create(f.s, returnedBody(f.d));
  for (const other of [
    { ...f.s, tenantId: randomUUID() },
    { ...f.s, facilityId: randomUUID() },
  ]) {
    await fail(f.rt.get(other, r.id), "NOT_FOUND");
    await fail(f.rt.get(other, r.id, 1), "NOT_FOUND");
    await fail(f.rt.history(other, r.id), "NOT_FOUND");
    await fail(f.rt.dispose(other, r.id, disposeBody()), "NOT_FOUND");
    await fail(f.rt.create(other, returnedBody(f.d)), "NOT_FOUND");
    assert.equal((await f.rt.list(other)).items.length, 0);
  }
});
test("concurrent duplicate returns and dispositions create one new episode only", async () => {
  const f = await issuedFixture(),
    out = await Promise.allSettled([
      f.rt.create(f.s, returnedBody(f.d)),
      f.rt.create(f.s, returnedBody(f.d, { code: "RETURN-2" })),
    ]);
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  const r = out.find((x) => x.status === "fulfilled").value;
  const d = await Promise.allSettled([
    f.rt.dispose(f.reviewer, r.id, disposeBody()),
    f.rt.dispose(f.reviewer, r.id, disposeBody({ episodeCode: "REPROCESS-2" })),
  ]);
  assert.equal(d.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(f.repo.state.processing.filter((x) => x.returnSource).length, 1);
});
