import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  ProcessingRegistry,
  TrayRegistry,
  PackagingRegistry,
  CycleRegistry,
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
test("passed cycle retains package hold, enters review and never releases or creates sterile status", async () => {
  const f = await fixture();
  let l = await f.cy.create(f.s, loadBody(f.packageRecord));
  assert.equal(l.packages[0].version, f.packageRecord.version);
  l = await f.cy.start(f.s, l.id, cycleStart(1));
  const command = result(2);
  l = await f.cy.finish(f.s, l.id, command);
  assert.equal(l.state, "awaiting_review");
  assert.equal(l.outcome, "passed");
  assert.equal(l.finishedBy, f.s.actorId);
  assert.equal("released" in l, false);
  const p = await f.pk.get(f.s, f.packageRecord.id);
  assert.equal(p.state, "packaged");
  assert.equal(p.activeLoad.state, "awaiting_review");
  await fail(
    f.pk.void(f.s, p.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    }),
    "LOAD_BLOCKED",
  );
  assert.equal((await f.cy.get(f.s, l.id, 1)).state, "draft");
  assert.equal((await f.cy.get(f.s, l.id, 2)).outcome, null);
  assert.equal((await f.cy.history(f.s, l.id)).items.length, 3);
  assert.deepEqual(await f.cy.finish(f.s, l.id, command), l);
  await fail(
    f.cy.cancel(f.s, l.id, {
      requestId: randomUUID(),
      version: 3,
      reason: "Demo",
      confirmed: true,
    }),
    "CONFLICT",
  );
});
test("failed and aborted cycles retain membership and cannot be overwritten or cancelled", async () => {
  for (const outcome of ["failed", "aborted"]) {
    const f = await fixture(),
      l = await f.cy.create(f.s, loadBody(f.packageRecord));
    await f.cy.start(f.s, l.id, cycleStart(1));
    await fail(
      f.cy.finish(f.s, l.id, result(2, { outcome, note: "" })),
      "INVALID_REQUEST",
    );
    const x = await f.cy.finish(
      f.s,
      l.id,
      result(2, { outcome, note: "Fictional failure", indicatorEvidence: "" }),
    );
    assert.equal(x.state, outcome);
    assert.ok((await f.pk.get(f.s, f.packageRecord.id)).activeLoad);
    await fail(f.cy.finish(f.s, l.id, result(3)), "CONFLICT");
    await fail(
      f.cy.contents(f.s, l.id, {
        requestId: randomUUID(),
        version: 3,
        packageIds: [f.packageRecord.id],
        confirmed: true,
      }),
      "CONFLICT",
    );
  }
});
test("draft contents replacement and cancellation release only that load reservations and retain versions", async () => {
  const f = await fixture(),
    second = await anotherPackage(f),
    l = await f.cy.create(f.s, loadBody(f.packageRecord));
  const x = await f.cy.contents(f.s, l.id, {
    requestId: randomUUID(),
    version: 1,
    packageIds: [second.id],
    confirmed: true,
  });
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).activeLoad, undefined);
  assert.equal((await f.pk.get(f.s, second.id)).activeLoad.loadId, l.id);
  assert.equal(
    (await f.cy.get(f.s, l.id, 1)).packages[0].id,
    f.packageRecord.id,
  );
  const cancel = {
    requestId: randomUUID(),
    version: 2,
    reason: "Demo cancellation",
    confirmed: true,
  };
  await f.cy.cancel(f.s, l.id, cancel);
  assert.equal((await f.pk.get(f.s, second.id)).activeLoad, undefined);
  const next = await f.cy.create(f.s, loadBody(second, { code: "LOAD-2" }));
  await f.cy.cancel(f.s, l.id, cancel);
  assert.equal((await f.pk.get(f.s, second.id)).activeLoad.loadId, next.id);
  assert.equal(x.version, 2);
});
test("rejects invalid or missing package membership, confirmations, evidence and stale commands", async () => {
  const f = await fixture();
  for (const patch of [
    { packageIds: [] },
    { packageIds: [f.packageRecord.id, f.packageRecord.id] },
    { packageIds: Array.from({ length: 101 }, () => randomUUID()) },
    { confirmed: false },
    { profileVersion: "" },
  ])
    await fail(
      f.cy.create(f.s, loadBody(f.packageRecord, patch)),
      "INVALID_REQUEST",
    );
  await fail(
    f.cy.create(f.s, loadBody(f.packageRecord, { packageIds: [randomUUID()] })),
    "NOT_FOUND",
  );
  const b = loadBody(f.packageRecord),
    l = await f.cy.create(f.s, b);
  assert.deepEqual(await f.cy.create(f.s, b), l);
  await fail(f.cy.create(f.s, { ...b, profile: "Changed" }), "CONFLICT");
  await fail(f.cy.start(f.s, l.id, cycleStart(2)), "CONFLICT");
  await f.cy.start(f.s, l.id, cycleStart(1));
  await fail(
    f.cy.finish(f.s, l.id, result(2, { indicatorEvidence: "" })),
    "INVALID_REQUEST",
  );
  await fail(
    f.cy.finish(f.s, l.id, result(2, { cycleEvidence: "" })),
    "INVALID_REQUEST",
  );
});
test("prevents duplicate equipment cycle reference while allowing its use on a different sterilizer", async () => {
  const f = await fixture(),
    second = await anotherPackage(f),
    l = await f.cy.create(f.s, loadBody(f.packageRecord));
  await f.cy.start(f.s, l.id, cycleStart(1));
  const next = await f.cy.create(f.s, loadBody(second, { code: "LOAD-2" }));
  await fail(f.cy.start(f.s, next.id, cycleStart(1)), "CONFLICT");
  await f.cy.cancel(f.s, next.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
    confirmed: true,
  });
  const third = await f.cy.create(
    f.s,
    loadBody(second, { code: "LOAD-3", sterilizer: "STER-2" }),
  );
  assert.equal(
    (await f.cy.start(f.s, third.id, cycleStart(1))).state,
    "running",
  );
});
test("cycle audit failures roll back holds, machine-cycle uniqueness, result and history", async () => {
  const f = await fixture(),
    b = loadBody(f.packageRecord);
  f.repo.failAudit = true;
  await assert.rejects(f.cy.create(f.s, b));
  f.repo.failAudit = false;
  assert.equal((await f.pk.get(f.s, f.packageRecord.id)).activeLoad, undefined);
  const l = await f.cy.create(f.s, b),
    start = cycleStart(1);
  f.repo.failAudit = true;
  await assert.rejects(f.cy.start(f.s, l.id, start));
  f.repo.failAudit = false;
  assert.equal(f.repo.state.machineCycles.length, 0);
  assert.equal((await f.cy.get(f.s, l.id)).state, "draft");
  await f.cy.start(f.s, l.id, start);
  f.repo.failAudit = true;
  await assert.rejects(f.cy.finish(f.s, l.id, result(2)));
  f.repo.failAudit = false;
  assert.equal((await f.cy.get(f.s, l.id)).state, "running");
  await fail(f.cy.get(f.s, l.id, 3), "NOT_FOUND");
});
test("cycles are tenant/facility scoped and concurrent membership accepts one claimant", async () => {
  const f = await fixture(),
    results = await Promise.allSettled([
      f.cy.create(f.s, loadBody(f.packageRecord)),
      f.cy.create(f.s, loadBody(f.packageRecord, { code: "LOAD-2" })),
    ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    results.find((x) => x.status === "rejected").reason.code,
    "LOAD_BLOCKED",
  );
  const l = results.find((x) => x.status === "fulfilled").value;
  for (const s of [
    { ...f.s, facilityId: randomUUID() },
    { ...f.s, tenantId: randomUUID() },
  ]) {
    assert.equal((await f.cy.list(s)).items.length, 0);
    await fail(f.cy.get(s, l.id), "NOT_FOUND");
    await fail(f.cy.get(s, l.id, 1), "NOT_FOUND");
    await fail(f.cy.history(s, l.id), "NOT_FOUND");
    await fail(f.cy.start(s, l.id, cycleStart(1)), "NOT_FOUND");
  }
});
test("voided packages cannot be loaded and only a draft cancellation releases its hold", async () => {
  const f = await fixture();
  await f.pk.void(f.s, f.packageRecord.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
    confirmed: true,
  });
  await fail(f.cy.create(f.s, loadBody(f.packageRecord)), "LOAD_BLOCKED");
  const g = await fixture(),
    l = await g.cy.create(g.s, loadBody(g.packageRecord));
  g.repo.failAudit = true;
  await assert.rejects(
    g.cy.cancel(g.s, l.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    }),
  );
  g.repo.failAudit = false;
  assert.ok((await g.pk.get(g.s, g.packageRecord.id)).activeLoad);
  await g.cy.cancel(g.s, l.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
    confirmed: true,
  });
  await g.pk.void(g.s, g.packageRecord.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo",
    confirmed: true,
  });
});
test("recorded exposures count each finished load once across all outcomes without changing identity versions", async () => {
  const { ServiceUsageRegistry } = await import("../dist/index.js");
  for (const outcome of ["passed", "failed", "aborted"]) {
    const f = await fixture(),
      u = new ServiceUsageRegistry(f.repo),
      load = await f.cy.create(f.s, loadBody(f.packageRecord));
    await u.configure(f.s, f.i.id, {
      requestId: randomUUID(),
      version: 0,
      interval: 2,
      warningBefore: 1,
      reference: "DEMO-PROCEDURE",
      confirmed: true,
    });
    assert.equal((await u.get(f.s, f.i.id)).usage.totalRecorded, 0);
    await f.cy.start(f.s, load.id, cycleStart(1));
    assert.equal((await u.get(f.s, f.i.id)).usage.totalRecorded, 0);
    const b = result(2, {
      outcome,
      note: outcome === "passed" ? "" : "Fictional outcome",
    });
    await f.cy.finish(f.s, load.id, b);
    await f.cy.finish(f.s, load.id, b);
    const r = (await u.get(f.s, f.i.id)).usage;
    assert.equal(r.totalRecorded, 1);
    assert.equal(r.serviceBaseline, 0);
    assert.equal(r.interval - r.totalRecorded, 1);
    assert.equal((await f.ir.get(f.s, f.i.id)).version, f.i.version);
    const history = await u.history(f.s, f.i.id);
    assert.equal(history.items.length, 1);
    assert.equal(history.items[0].outcome, outcome);
  }
});
test("service limit blocks new tray membership and cannot be raised to bypass due service; current review remains intact", async () => {
  const { ServiceUsageRegistry, ReviewRegistry } =
      await import("../dist/index.js"),
    f = await fixture(),
    u = new ServiceUsageRegistry(f.repo),
    policy = {
      requestId: randomUUID(),
      version: 0,
      interval: 1,
      warningBefore: 0,
      reference: "DEMO-1",
      confirmed: true,
    };
  const configured = await u.configure(f.s, f.i.id, policy);
  assert.deepEqual(await u.configure(f.s, f.i.id, policy), configured);
  const load = await f.cy.create(f.s, loadBody(f.packageRecord));
  await f.cy.start(f.s, load.id, cycleStart(1));
  const done = await f.cy.finish(f.s, load.id, result(2));
  const usage = (await u.get(f.s, f.i.id)).usage;
  assert.equal(usage.totalRecorded, 1);
  await fail(
    u.configure(f.s, f.i.id, {
      ...policy,
      requestId: randomUUID(),
      version: usage.version,
      interval: 100,
    }),
    "SERVICE_DUE",
  );
  const a = await f.tr.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "NEW-TRAY",
    definitionId: f.d.id,
    definitionVersion: 1,
  });
  await fail(
    f.tr.updateContents(f.s, a.id, {
      requestId: randomUUID(),
      version: 1,
      instrumentIds: [f.i.id],
    }),
    "SERVICE_DUE",
  );
  const review = await new ReviewRegistry(f.repo).decide(
    { ...f.s, actorId: randomUUID() },
    {
      requestId: randomUUID(),
      loadId: load.id,
      loadVersion: done.version,
      reviewVersion: 0,
      decision: "release",
      reason: "Fictional valid existing-load review",
      reference: "DEMO",
      cycleChecked: true,
      indicatorsChecked: true,
      packagesChecked: true,
      profileChecked: true,
      confirmed: true,
    },
  );
  assert.equal(review.state, "released");
  const { TraceabilityRegistry } = await import("../dist/index.js");
  const report = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "instrument",
    f.i.id,
  );
  assert.ok(report.alerts.some((a) => a.kind === "service_due"));
  assert.ok(JSON.stringify(report).includes("service_usage"));
});
test("service policy validation, scope, stale updates and audit failure retain counters and cycle state", async () => {
  const { ServiceUsageRegistry } = await import("../dist/index.js"),
    f = await fixture(),
    u = new ServiceUsageRegistry(f.repo),
    b = {
      requestId: randomUUID(),
      version: 0,
      interval: 10,
      warningBefore: 2,
      reference: "PROCEDURE",
      confirmed: true,
    };
  for (const patch of [
    { interval: 0 },
    { interval: 1.2 },
    { warningBefore: 10 },
    { warningBefore: -1 },
    { confirmed: false },
    { reference: "" },
  ])
    await fail(u.configure(f.s, f.i.id, { ...b, ...patch }), "INVALID_REQUEST");
  await fail(
    u.configure({ ...f.s, facilityId: randomUUID() }, f.i.id, b),
    "NOT_FOUND",
  );
  await u.configure(f.s, f.i.id, b);
  await fail(
    u.configure(f.s, f.i.id, { ...b, requestId: randomUUID() }),
    "CONFLICT",
  );
  const load = await f.cy.create(f.s, loadBody(f.packageRecord));
  await f.cy.start(f.s, load.id, cycleStart(1));
  const before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.cy.finish(f.s, load.id, result(2)));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const r = await Promise.allSettled([
    f.cy.finish(f.s, load.id, result(2)),
    f.cy.finish(f.s, load.id, result(2)),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await u.get(f.s, f.i.id)).usage.totalRecorded, 1);
});
test("sterilization procedure freezes applicability on draft and withdrawal blocks future cycle start", async () => {
  const { ProcedureRegistry } = await import("../dist/index.js"),
    f = await fixture(),
    registry = new ProcedureRegistry(f.repo),
    d = await registry.draft(f.s, {
      requestId: randomUUID(),
      code: "STER-PROFILE",
      title: "Fictional steam profile",
      stage: "sterilization",
      method: "steam",
      instructions: "FICTIONAL — no machine parameters",
      source: "DEMO",
      instrumentTypeIds: [f.i.instrumentTypeId],
      confirmed: true,
    }),
    p = await registry.transition(f.s, d.id, "publish", {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    });
  const l = await f.cy.create(
    f.s,
    loadBody(f.packageRecord, {
      profile: p.code,
      profileVersion: String(p.revision),
      procedureRevisionId: p.id,
    }),
  );
  assert.deepEqual(l.controlledProcedure, p);
  await registry.transition(f.s, p.id, "withdraw", {
    requestId: randomUUID(),
    version: 2,
    reason: "Demo withdrawal",
    confirmed: true,
  });
  await fail(f.cy.start(f.s, l.id, cycleStart(1)), "PROCEDURE_BLOCKED");
  assert.deepEqual((await f.cy.get(f.s, l.id)).controlledProcedure, p);
});
