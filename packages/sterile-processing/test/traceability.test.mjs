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
  TraceabilityRegistry,
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

test("exact normalized search keeps ambiguous kinds distinct and reads never mutate state", async () => {
  const f = await fixture(),
    trace = new TraceabilityRegistry(f.repo);
  await f.tr.createDefinition(f.s, {
    requestId: randomUUID(),
    code: f.i.code,
    name: "Same code, different kind",
    requirements: [{ instrumentTypeId: f.i.instrumentTypeId, quantity: 1 }],
  });
  const before = structuredClone(f.repo.state),
    matches = await trace.search(f.s, "  ins-1  ");
  assert.deepEqual(matches.map((x) => x.kind).sort(), [
    "definition",
    "instrument",
  ]);
  assert.equal((await trace.search(f.s, "INS")).length, 0);
  await fail(trace.search(f.s, "INS*"), "INVALID_REQUEST");
  const report = await trace.report(f.s, "instrument", f.i.id);
  assert.equal(report.root.code, f.i.code);
  assert.equal(report.coverage, "recorded-links-only");
  assert.deepEqual(f.repo.state, before);
});
test("package report connects original issue and return to the newly authorized receiving episode", async () => {
  const f = await issuedFixture(),
    rt = new ReturnRegistry(f.repo),
    ret = await rt.create(f.s, returnedBody(f.d)),
    next = await rt.dispose(f.reviewer, ret.id, disposeBody()),
    trace = new TraceabilityRegistry(f.repo),
    report = await trace.report(f.s, "package", f.packageRecord.id);
  for (const kind of [
    "instrument",
    "definition",
    "assembly",
    "processing",
    "package",
    "load",
    "review",
    "distribution",
    "return",
  ])
    assert.ok(
      report.nodes.some((n) => n.kind === kind),
      kind,
    );
  assert.ok(
    report.links.some(
      (l) => l.relation === "original_issue" && l.toVersion === 2,
    ),
  );
  assert.ok(
    report.links.some(
      (l) => l.relation === "new_episode" && l.toId === next.episodeId,
    ),
  );
  assert.ok(report.alerts.some((a) => a.kind === "return_block"));
  assert.ok(report.alerts.some((a) => a.kind === "processing_hold"));
  const old = report.nodes.find(
    (n) => n.kind === "assembly" && n.id === f.a.id,
  );
  assert.equal(old.state, "disassembled");
  assert.ok(
    old.snapshots.some(
      (s) =>
        !s.current &&
        s.fields.some((v) => v.key === "state" && v.value === "complete"),
    ),
  );
  const history = report.nodes.find(
    (n) => n.kind === "processing" && n.id === f.e.id,
  );
  assert.ok(
    history.snapshots.some((s) =>
      s.facts.some((f) => f.kind === "inspection_item"),
    ),
  );
  assert.ok(report.events.some((e) => e.correlationRequestId));
  assert.equal(report.nodes.find((n) => n.kind === "review").state, "released");
});
test("instrument trace includes historical load membership but never expands co-loaded sibling lifecycles", async () => {
  const f = await fixture(),
    sibling = await anotherPackage(f),
    load = await f.cy.create(
      f.s,
      loadBody(f.packageRecord, {
        packageIds: [f.packageRecord.id, sibling.id],
      }),
    ),
    trace = new TraceabilityRegistry(f.repo);
  let r = await trace.report(f.s, "instrument", f.i.id);
  assert.equal(
    r.nodes.some((n) => n.id === sibling.id),
    false,
  );
  let l = r.nodes.find((n) => n.kind === "load");
  assert.equal(
    l.snapshots[0].fields.find((f) => f.key === "packageCount").value,
    2,
  );
  assert.equal(
    l.snapshots[0].fields.find((f) => f.key === "matchedPackageCount").value,
    1,
  );
  await f.cy.contents(f.s, load.id, {
    requestId: randomUUID(),
    version: 1,
    packageIds: [sibling.id],
    confirmed: true,
  });
  r = await trace.report(f.s, "instrument", f.i.id);
  l = r.nodes.find((n) => n.id === load.id);
  assert.equal(l.version, 2);
  assert.ok(
    r.links.some(
      (l) =>
        l.fromId === load.id &&
        l.fromVersion === 1 &&
        l.toId === f.packageRecord.id,
    ),
  );
  assert.equal(
    r.links.some(
      (l) =>
        l.fromId === load.id &&
        l.fromVersion === 2 &&
        l.toId === f.packageRecord.id,
    ),
    false,
  );
  const whole = await trace.report(f.s, "load", load.id);
  assert.ok(whole.nodes.some((n) => n.id === sibling.id));
  assert.ok(whole.nodes.some((n) => n.id === f.packageRecord.id));
});
test("removed draft assembly members remain traceable through frozen historical membership", async () => {
  const f = await fixture();
  await f.pk.void(f.s, f.packageRecord.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
    confirmed: true,
  });
  await f.tr.transition(f.s, f.a.id, {
    requestId: randomUUID(),
    version: f.a.version,
    action: "disassemble",
    reason: "Demo",
    confirmed: true,
  });
  let a = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "CHANGING",
    definitionId: f.a.definitionId,
    definitionVersion: 1,
  });
  a = await f.tr.updateContents(f.s, a.id, {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: [f.i.id],
  });
  await f.tr.updateContents(f.s, a.id, {
    requestId: randomUUID(),
    version: 2,
    instrumentIds: [],
  });
  const r = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "instrument",
    f.i.id,
  );
  assert.ok(r.nodes.some((n) => n.id === a.id && n.version === 3));
  assert.ok(
    r.links.some(
      (l) => l.fromId === a.id && l.fromVersion === 2 && l.toId === f.i.id,
    ),
  );
  assert.equal(
    r.links.some(
      (l) => l.fromId === a.id && l.fromVersion === 3 && l.toId === f.i.id,
    ),
    false,
  );
});
test("current recall blocks remain visible independently of historical release", async () => {
  const f = await issuedFixture();
  await new RecallRegistry(f.repo).create(f.reviewer, {
    requestId: randomUUID(),
    code: "RECALL-TRACE",
    sourceKind: "load",
    sourceId: f.l.id,
    sourceVersion: f.l.version,
    reason: "Demo recall",
    reference: "DEMO",
    confirmed: true,
  });
  const r = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "package",
    f.packageRecord.id,
  );
  assert.ok(r.alerts.some((a) => a.kind === "recall_block"));
  assert.equal(r.nodes.find((n) => n.kind === "review").state, "released");
  assert.ok(
    r.nodes
      .find((n) => n.kind === "recall")
      .snapshots[0].facts.some((f) => f.kind === "recall_member"),
  );
});
test("foreign tenants/facilities, unknown roots, invalid kinds and IDs do not disclose history", async () => {
  const f = await fixture(),
    trace = new TraceabilityRegistry(f.repo);
  for (const other of [
    { ...f.s, tenantId: randomUUID() },
    { ...f.s, facilityId: randomUUID() },
  ]) {
    assert.deepEqual(await trace.search(other, f.i.code), []);
    await fail(trace.report(other, "instrument", f.i.id), "NOT_FOUND");
  }
  await fail(trace.report(f.s, "processing", f.e.id), "INVALID_REQUEST");
  await fail(trace.report(f.s, "instrument", "bad"), "INVALID_REQUEST");
  await fail(trace.report(f.s, "package", randomUUID()), "NOT_FOUND");
});
test("reports fail explicitly instead of silently truncating source snapshots or events", async () => {
  const f = await fixture();
  for (const mode of ["rows", "events"]) {
    const repo = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            ...(mode === "rows"
              ? {
                  traceRows: async () =>
                    Array.from({ length: 1001 }, () => ({
                      kind: "instrument",
                      current: true,
                      record: { ...f.i, id: randomUUID() },
                    })),
                }
              : {
                  traceAudit: async () =>
                    Array.from({ length: 2001 }, () => f.repo.state.audit[0]),
                }),
          }),
        ),
    };
    await fail(
      new TraceabilityRegistry(repo).report(f.s, "instrument", f.i.id),
      "TRACE_LIMIT",
    );
  }
});

test("a referenced instrument version without a saved snapshot is flagged instead of silently relinked to current", async () => {
  const f = await fixture();
  await f.pk.void(f.s, f.packageRecord.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
    confirmed: true,
  });
  await f.tr.transition(f.s, f.a.id, {
    requestId: randomUUID(),
    version: f.a.version,
    action: "disassemble",
    reason: "Demo",
    confirmed: true,
  });
  await f.ir.retire(f.s, f.i.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
  });
  const r = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "instrument",
    f.i.id,
  );
  assert.equal(r.nodes.find((n) => n.kind === "instrument").version, 2);
  const old = r.links.find(
    (l) => l.toKind === "instrument" && l.toVersion === 1,
  );
  assert.ok(old);
  assert.equal(old.targetAvailable, false);
});
