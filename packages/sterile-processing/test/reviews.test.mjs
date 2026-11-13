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
test("release records reviewer and frozen evidence separately without overwriting operator cycle or packaging", async () => {
  const f = await reviewedFixture(),
    r = await f.rr.decide(f.reviewer, reviewBody(f.l));
  assert.equal(r.state, "released");
  assert.equal(r.decisions[0].actorId, f.reviewer.actorId);
  assert.deepEqual(r.loadSnapshot, f.l);
  assert.equal((await f.cy.get(f.s, f.l.id)).version, 3);
  assert.equal((await f.cy.get(f.s, f.l.id)).review.state, "released");
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).state, "packaged");
  assert.equal(
    (await f.pk.get(f.s, f.packageRecord.id)).activeLoad.review.state,
    "released",
  );
  assert.equal((await f.rr.queue(f.reviewer)).items.length, 0);
  assert.equal(
    (await f.rr.history(f.reviewer, r.id)).items[0].actorId,
    f.reviewer.actorId,
  );
});
test("hold retains availability restrictions and later release preserves the held decision version", async () => {
  const f = await reviewedFixture();
  const hold = await f.rr.decide(
    f.reviewer,
    reviewBody(f.l, { decision: "hold", cycleChecked: false }),
  );
  assert.equal(hold.state, "held");
  assert.equal((await f.rr.queue(f.reviewer)).items[0].reviewVersion, 1);
  await fail(
    f.pk.void(f.s, f.packageRecord.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    }),
    "LOAD_BLOCKED",
  );
  const release = await f.rr.decide(
    f.reviewer,
    reviewBody(f.l, { reviewVersion: 1 }),
  );
  assert.equal(release.decisions.length, 2);
  assert.equal((await f.rr.get(f.s, release.id, 1)).state, "held");
  assert.deepEqual(release.loadSnapshot, hold.loadSnapshot);
  assert.equal(
    (await f.pk.get(f.s, f.packageRecord.id)).activeLoad.review.state,
    "released",
  );
});
test("reject retains holds and is terminal; failed and aborted cycles cannot be released", async () => {
  for (const outcome of ["failed", "aborted"]) {
    const f = await reviewedFixture(outcome);
    await fail(f.rr.decide(f.reviewer, reviewBody(f.l)), "REVIEW_BLOCKED");
    const r = await f.rr.decide(
      f.reviewer,
      reviewBody(f.l, { decision: "reject" }),
    );
    assert.equal(r.state, "rejected");
    assert.equal(
      (await f.pk.get(f.s, f.packageRecord.id)).activeLoad.review.state,
      "rejected",
    );
    await fail(
      f.rr.decide(
        f.reviewer,
        reviewBody(f.l, { reviewVersion: 1, decision: "hold" }),
      ),
      "CONFLICT",
    );
  }
});
test("release refuses same cycle operator, missing confirmations/evidence checks, and stale versions", async () => {
  const f = await reviewedFixture();
  await fail(f.rr.decide(f.s, reviewBody(f.l)), "REVIEW_BLOCKED");
  for (const patch of [
    { confirmed: false },
    { cycleChecked: false },
    { indicatorsChecked: false },
    { packagesChecked: false },
    { profileChecked: false },
    { reason: "" },
    { reference: "" },
    { cycleChecked: "true" },
  ])
    await fail(
      f.rr.decide(f.reviewer, reviewBody(f.l, patch)),
      "INVALID_REQUEST",
    );
  await fail(
    f.rr.decide(f.reviewer, reviewBody(f.l, { loadVersion: 2 })),
    "CONFLICT",
  );
  await fail(
    f.rr.decide(f.reviewer, reviewBody(f.l, { reviewVersion: 1 })),
    "CONFLICT",
  );
});
test("review audit failure rolls back decisions, versions and retry receipts without altering load locks", async () => {
  const f = await reviewedFixture(),
    b = reviewBody(f.l);
  f.repo.failAudit = true;
  await assert.rejects(f.rr.decide(f.reviewer, b));
  f.repo.failAudit = false;
  assert.equal((await f.rr.list(f.s)).items.length, 0);
  assert.equal((await f.rr.queue(f.s)).items[0].reviewVersion, 0);
  assert.equal(
    (await f.pk.get(f.s, f.packageRecord.id)).activeLoad.review,
    undefined,
  );
  const r = await f.rr.decide(f.reviewer, b);
  assert.deepEqual(await f.rr.decide(f.reviewer, b), r);
  await fail(
    f.rr.decide(f.reviewer, { ...b, reason: "Different" }),
    "CONFLICT",
  );
});
test("review reads, decisions, queue and immutable versions stay tenant/facility scoped", async () => {
  const f = await reviewedFixture(),
    r = await f.rr.decide(f.reviewer, reviewBody(f.l));
  for (const s of [
    { ...f.reviewer, facilityId: randomUUID() },
    { ...f.reviewer, tenantId: randomUUID() },
  ]) {
    assert.equal((await f.rr.list(s)).items.length, 0);
    assert.equal((await f.rr.queue(s)).items.length, 0);
    await fail(f.rr.get(s, r.id), "NOT_FOUND");
    await fail(f.rr.get(s, r.id, 1), "NOT_FOUND");
    await fail(f.rr.history(s, r.id), "NOT_FOUND");
    await fail(f.rr.decide(s, reviewBody(f.l)), "NOT_FOUND");
  }
});
test("concurrent conflicting review decisions accept one and cannot silently change a final release", async () => {
  const f = await reviewedFixture(),
    results = await Promise.allSettled([
      f.rr.decide(f.reviewer, reviewBody(f.l)),
      f.rr.decide(f.reviewer, reviewBody(f.l, { decision: "reject" })),
    ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    results.find((x) => x.status === "rejected").reason.code,
    "CONFLICT",
  );
  const r = results.find((x) => x.status === "fulfilled").value;
  await fail(
    f.rr.decide(
      f.reviewer,
      reviewBody(f.l, { reviewVersion: 1, decision: "hold" }),
    ),
    "CONFLICT",
  );
  assert.equal((await f.rr.history(f.s, r.id)).items.length, 1);
});
test("a held review cannot silently approve an amended source load while preserving older evidence", async () => {
  const f = await reviewedFixture();
  await f.rr.decide(f.reviewer, reviewBody(f.l, { decision: "hold" }));
  f.repo.state.loads.find((x) => x.id === f.l.id).version = 4;
  await fail(
    f.rr.decide(
      f.reviewer,
      reviewBody(f.l, { loadVersion: 4, reviewVersion: 1 }),
    ),
    "CONFLICT",
  );
  assert.equal((await f.rr.list(f.s)).items[0].state, "held");
});
