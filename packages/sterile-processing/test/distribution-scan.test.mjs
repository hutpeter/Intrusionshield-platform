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
const token = (f) =>
  `RSP-P-${f.packageRecord.id.toUpperCase()}-V${f.packageRecord.version}`;
test("released scan is read-only and opens unstored or current stored record", async () => {
  const f = await distributionFixture(),
    before = structuredClone(f.repo.state),
    r = await f.dr.scan(f.s, token(f));
  assert.equal(r.package.id, f.packageRecord.id);
  assert.equal(r.package.activeLoad.review.state, "released");
  assert.equal(r.distribution, null);
  assert.deepEqual(f.repo.state, before);
  const d = await f.dr.store(f.s, storeBody(f));
  assert.equal((await f.dr.scan(f.s, token(f))).distribution.id, d.id);
  assert.equal(
    (await f.dr.scan(f.s, token(f))).distribution.location,
    d.location,
  );
});
test("unreleased, held/rejected, stale label and foreign scans are rejected", async () => {
  for (const decision of ["hold", "reject"]) {
    const f = await distributionFixture(decision);
    await fail(f.dr.scan(f.s, token(f)), "DISTRIBUTION_BLOCKED");
  }
  const f = await distributionFixture();
  await fail(
    f.dr.scan(f.s, token(f).replace("-V1", "-V2")),
    "DISTRIBUTION_BLOCKED",
  );
  await fail(
    f.dr.scan({ ...f.s, facilityId: randomUUID() }, token(f)),
    "NOT_FOUND",
  );
  await fail(f.dr.scan(f.s, "https://example.org"), "INVALID_REQUEST");
  const g = await fixture();
  await fail(
    new DistributionRegistry(g.repo).scan(g.s, token(g)),
    "DISTRIBUTION_BLOCKED",
  );
});
test("issued, recalled and returned packages cannot be reopened by scan", async () => {
  const f = await distributionFixture(),
    d = await f.dr.store(f.s, storeBody(f));
  await f.dr.issue(f.s, d.id, issueBody(1));
  await fail(f.dr.scan(f.s, token(f)), "DISTRIBUTION_BLOCKED");
  const g = await distributionFixture();
  for (const [method, code] of [
    ["findRecallBlock", "RECALL_BLOCKED"],
    ["findReturnByPackage", "RETURN_BLOCKED"],
  ]) {
    const repo = {
      transaction: (s, work) =>
        g.repo.transaction(s, (tx) =>
          work({ ...tx, [method]: async () => ({ id: randomUUID() }) }),
        ),
    };
    await fail(new DistributionRegistry(repo).scan(g.s, token(g)), code);
  }
});
test("movement after scan rechecks release and remains atomic on audit failure", async () => {
  const f = await distributionFixture();
  await f.dr.scan(f.s, token(f));
  const before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.dr.store(f.s, storeBody(f)));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const blocked = {
    transaction: (s, work) =>
      f.repo.transaction(s, (tx) =>
        work({ ...tx, findRecallBlock: async () => ({ id: randomUUID() }) }),
      ),
  };
  await fail(
    new DistributionRegistry(blocked).store(f.s, storeBody(f)),
    "RECALL_BLOCKED",
  );
  assert.equal(f.repo.state.distribution.length, 0);
});
