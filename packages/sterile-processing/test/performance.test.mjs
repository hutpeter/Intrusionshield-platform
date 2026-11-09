import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PerformanceRegistry, timingMetric } from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const at = (s) => "2026-11-" + s + ".000Z";
function fixture(t) {
  const now = Date.parse(at("03T12:00:00"));
  t.mock.timers.enable({ apis: ["Date"], now });
  const repo = new MemoryRepository(),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    base = { tenantId: s.tenantId, facilityId: s.facilityId },
    a = {
      id: randomUUID(),
      code: "A",
      instrumentTypeId: randomUUID(),
      instrumentTypeName: "Clamp",
      serialNumber: "",
      instrumentVersion: 1,
    },
    b = {
      ...a,
      id: randomUUID(),
      code: "B",
      instrumentTypeId: randomUUID(),
      instrumentTypeName: "Scissors",
    },
    c = { ...a, id: randomUUID(), code: "C" },
    eq = {
      ...base,
      id: randomUUID(),
      code: "STER",
      name: "Demo sterilizer",
      kind: "sterilizer",
      methods: ["steam"],
      state: "in_service",
      version: 1,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
  repo.state.types.push(
    { ...base, id: a.instrumentTypeId, code: "CLAMP", name: "Clamp" },
    { ...base, id: b.instrumentTypeId, code: "SCISSORS", name: "Scissors" },
  );
  const episode = {
    ...base,
    id: randomUUID(),
    code: "REC",
    version: 6,
    state: "ready_for_assembly",
    createdAt: at("01T23:50:00"),
    updatedAt: at("02T00:45:00"),
    instruments: [a, b],
    attempts: [
      {
        number: 1,
        method: "mechanical",
        equipment: "LEGACY-WASH",
        startedAt: at("01T23:55:00"),
        finishedAt: at("02T00:05:00"),
        outcome: "failed",
      },
      {
        number: 2,
        method: "mechanical",
        equipment: "LEGACY-WASH",
        startedAt: at("02T00:10:00"),
        finishedAt: at("02T00:30:00"),
        outcome: "passed",
      },
    ],
    inspections: [
      { number: 1, at: at("02T00:35:00"), outcome: "failed" },
      { number: 2, at: at("02T00:45:00"), outcome: "passed" },
    ],
  };
  const p = {
      ...base,
      id: randomUUID(),
      code: "PACK",
      version: 2,
      state: "voided",
      createdAt: at("02T01:00:00"),
      assemblySnapshot: { instruments: [a, b] },
      inspectionProofs: [],
    },
    p2 = {
      ...p,
      id: randomUUID(),
      code: "PACK-2",
      version: 1,
      state: "packaged",
      createdAt: at("02T01:10:00"),
      assemblySnapshot: { instruments: [c] },
    };
  const l = {
      ...base,
      id: randomUUID(),
      code: "LOAD",
      version: 3,
      state: "awaiting_review",
      createdAt: at("02T01:20:00"),
      startedAt: at("02T01:30:00"),
      finishedAt: at("02T02:00:00"),
      updatedAt: at("02T02:00:00"),
      outcome: "passed",
      sterilizer: "STER",
      registeredEquipment: eq,
      startedEquipment: eq,
      packages: [{ id: p.id, version: 1 }],
    },
    l2 = {
      ...l,
      id: randomUUID(),
      code: "LOAD-2",
      state: "failed",
      startedAt: at("02T01:45:00"),
      finishedAt: at("02T02:15:00"),
      outcome: "failed",
      packages: [{ id: p2.id, version: 1 }],
    };
  repo.state.processing.push(episode, {
    ...base,
    id: randomUUID(),
    code: "OLD-WAITING",
    state: "received",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    instruments: [a],
    attempts: [],
    inspections: [],
  });
  repo.state.processingVersions.push(structuredClone(episode));
  repo.state.assemblies.push({
    ...base,
    id: randomUUID(),
    code: "ASM",
    state: "disassembled",
    completedAt: at("02T00:50:00"),
    updatedAt: at("02T00:55:00"),
    instruments: [a, b],
  });
  repo.state.packages.push(p, p2);
  repo.state.packageVersions.push(
    { ...p, version: 1, state: "packaged" },
    p,
    p2,
  );
  repo.state.loads.push(l, l2);
  repo.state.loadVersions.push(l, { ...l, version: 2, state: "running" });
  repo.state.reviews.push(
    {
      ...base,
      id: randomUUID(),
      loadId: l.id,
      state: "released",
      version: 2,
      loadSnapshot: l,
      decisions: [
        { at: at("02T02:10:00"), decision: "hold" },
        { at: at("02T02:20:00"), decision: "release" },
      ],
    },
    {
      ...base,
      id: randomUUID(),
      loadId: l2.id,
      state: "rejected",
      loadSnapshot: l2,
      decisions: [{ at: at("02T02:30:00"), decision: "reject" }],
    },
  );
  repo.state.distribution.push({
    ...base,
    id: randomUUID(),
    code: "DIST",
    state: "issued",
    packageId: p.id,
    events: [
      { kind: "stored", at: at("02T02:25:00") },
      { kind: "transferred", at: at("02T02:26:00") },
      { kind: "issued", at: at("02T03:00:00") },
    ],
  });
  repo.state.returns.push({
    ...base,
    id: randomUUID(),
    code: "RETURN",
    packageId: p.id,
    state: "returned",
    version: 2,
    createdAt: at("02T04:00:00"),
    updatedAt: at("02T04:05:00"),
  });
  repo.state.equipmentVersions.push(
    eq,
    {
      ...eq,
      version: 2,
      state: "out_of_service",
      updatedAt: at("02T03:00:00"),
    },
    {
      ...eq,
      version: 3,
      state: "out_of_service",
      updatedAt: at("02T03:15:00"),
    },
    { ...eq, version: 4, state: "in_service", updatedAt: at("02T04:00:00") },
  );
  return {
    repo,
    s,
    a,
    b,
    p,
    p2,
    l,
    l2,
    eq,
    episode,
    now,
    registry: new PerformanceRegistry(repo),
  };
}
test("performance uses current records once, assigns UTC event days and counts rework with clear denominators", async (t) => {
  const f = fixture(t),
    r = await f.registry.report(f.s, "2026-11-01", "2026-11-03");
  assert.deepEqual(r.totals, {
    received: 1,
    cleaning: 2,
    inspection: 2,
    assembly: 1,
    packaging: 2,
    cycles: 2,
    release: 1,
    issue: 1,
    returns: 1,
  });
  assert.equal(r.daily[0].received, 1);
  assert.equal(r.daily[0].cleaning, 0);
  assert.equal(r.daily[1].cleaning, 2);
  assert.equal(r.quality.cleaningFailureRate, 0.5);
  assert.equal(r.quality.inspectionFailureRate, 0.5);
  assert.equal(r.quality.repeatCleaningStarts, 1);
  assert.equal(r.quality.cyclesFailed, 1);
  assert.equal(r.quality.holdDecisions, 1);
  assert.equal(r.quality.rejectDecisions, 1);
  const clamp = r.types.find((t) => t.id === f.a.instrumentTypeId);
  assert.equal(clamp.received, 1);
  assert.equal(clamp.cleaning, 2);
  assert.equal(clamp.assembly, 1);
  assert.equal(clamp.packaging, 2);
  assert.equal(clamp.cycles, 2);
  assert.equal(r.types.find((t) => t.id === f.b.instrumentTypeId).cycles, 1);
  assert.equal(r.oldest[0].code, "OLD-WAITING");
  assert.ok(r.oldest[0].ageMinutes > 40000);
  assert.equal(r.backlog.find((q) => q.queue === "cleaning").total, 1);
});
test("stage timing samples and merged equipment intervals exclude double-counting and infer no legacy downtime", async (t) => {
  const f = fixture(t),
    r = await f.registry.report(f.s, "2026-11-01", "2026-11-03");
  assert.deepEqual(r.timing.cleaning, {
    samples: 2,
    meanMinutes: 15,
    medianMinutes: 15,
    p95Minutes: 20,
    minMinutes: 10,
    maxMinutes: 20,
  });
  assert.equal(r.timing.receiptToInspection.meanMinutes, 55);
  assert.equal(r.timing.cycle.meanMinutes, 30);
  assert.equal(r.timing.finishToRelease.meanMinutes, 20);
  const machine = r.equipment.find((e) => e.id === f.eq.id);
  assert.equal(machine.cycleStarts, 2);
  assert.equal(machine.finishedRuns, 2);
  assert.equal(machine.recordedRunMinutes, 45);
  assert.equal(machine.outOfServiceMinutes, 60);
  const legacy = r.equipment.find((e) => e.link === "legacy_code");
  assert.equal(legacy.outOfServiceMinutes, null);
  assert.equal(legacy.recordedRunMinutes, 30);
  assert.equal(legacy.cleaningStarts, 2);
  assert.deepEqual(timingMetric([]), {
    samples: 0,
    meanMinutes: null,
    medianMinutes: null,
    p95Minutes: null,
    minMinutes: null,
    maxMinutes: null,
  });
});
test("exclusive UTC end boundaries, predecessor status, running spans and missing timing evidence remain explicit", async (t) => {
  const f = fixture(t);
  f.repo.state.equipmentVersions.push({
    ...f.eq,
    version: 5,
    state: "out_of_service",
    updatedAt: at("02T23:00:00"),
  });
  f.repo.state.loads.push({
    ...f.l,
    id: randomUUID(),
    code: "RUNNING",
    startedAt: at("02T23:30:00"),
    finishedAt: null,
    outcome: null,
    state: "running",
    packages: [],
  });
  f.repo.state.loads.push({
    ...f.l,
    id: randomUUID(),
    code: "NO-START",
    startedAt: null,
    finishedAt: at("03T00:00:00"),
    packages: [{ id: randomUUID(), version: 1 }],
  });
  const r = await f.registry.report(f.s, "2026-11-03", "2026-11-04");
  assert.equal(r.totals.cycles, 1);
  assert.equal(r.timing.cycle.samples, 0);
  assert.equal(r.exclusions.invalidTimingPairs, 1);
  assert.equal(r.exclusions.missingPackageSnapshots, 1);
  assert.equal(r.exclusions.unfinishedCycles, 1);
  const machine = r.equipment.find((e) => e.id === f.eq.id);
  assert.equal(machine.recordedRunMinutes, 720);
  assert.equal(machine.outOfServiceMinutes, 720);
  assert.equal(machine.cycleStarts, 0);
});
test("empty ranges, foreign facilities and large reports never expose another scope or silently truncate", async (t) => {
  const f = fixture(t),
    before = structuredClone(f.repo.state),
    empty = await f.registry.report(
      { ...f.s, facilityId: randomUUID() },
      "2026-11-01",
      "2026-11-03",
    );
  assert.ok(Object.values(empty.totals).every((n) => n === 0));
  assert.equal(empty.quality.cleaningFailureRate, null);
  assert.equal(empty.types.length, 0);
  assert.equal(empty.oldest.length, 0);
  assert.equal(empty.timing.cleaning.meanMinutes, null);
  assert.deepEqual(f.repo.state, before);
  for (const [from, to] of [
    ["2026-02-30", "2026-03-02"],
    ["2026-11-03", "2026-11-03"],
    ["2026-11-03", "2026-11-02"],
    ["2026-07-01", "2026-11-03"],
    ["2026-11-01", "2026-11-05"],
  ])
    await assert.rejects(f.registry.report(f.s, from, to), {
      code: "INVALID_REQUEST",
    });
  const huge = new PerformanceRegistry({
    transaction: (s, work) =>
      f.repo.transaction(s, (tx) =>
        work({
          ...tx,
          performanceData: async () => ({
            processing: Array(5001).fill({}),
            assemblies: [],
            packages: [],
            loads: [],
            reviews: [],
            distribution: [],
            returns: [],
            equipmentVersions: [],
          }),
        }),
      ),
  });
  await assert.rejects(huge.report(f.s, "2026-11-01", "2026-11-03"), {
    code: "REPORT_LIMIT",
  });
});
