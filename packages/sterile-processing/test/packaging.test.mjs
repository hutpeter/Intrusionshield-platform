import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  ProcessingRegistry,
  TrayRegistry,
  PackagingRegistry,
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
  ...(extra.consumableLotIds
    ? {
        consumableUsage: extra.consumableLotIds.map((lotId) => ({
          lotId,
          quantity: 1,
        })),
      }
    : {}),
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
  return { repo, s, ir, pr, tr, pk, i, d, a, e };
}
test("packaging freezes exact assembly and passed inspection evidence without creating sterile or expiry status", async () => {
  const f = await fixture(),
    x = await f.pk.pack(f.s, body(f.a));
  assert.equal(x.state, "packaged");
  assert.deepEqual(x.assemblySnapshot, f.a);
  assert.equal(x.inspectionProofs[0].episodeVersion, 4);
  assert.equal(x.inspectionProofs[0].evidence, "INSP-EVID");
  assert.equal(x.inspectionProofs[0].instrumentId, f.i.id);
  assert.equal("sterile" in x, false);
  assert.equal("expiresAt" in x, false);
  await f.tr.reviseDefinition(f.s, f.d.id, {
    requestId: randomUUID(),
    version: 1,
    name: "New tray",
    requirements: [{ instrumentTypeId: f.i.instrumentTypeId, quantity: 2 }],
    reason: "Demo revision",
  });
  assert.equal(
    (await f.pk.get(f.s, x.id)).assemblySnapshot.definitionSnapshot.name,
    "Demo tray",
  );
  const summary = (await f.pk.list(f.s)).items[0];
  assert.equal(summary.instrumentCount, 1);
  assert.equal("inspectionProofs" in summary, false);
});
test("packaging refuses incomplete assembly and earlier composition-only tray without inspection", async () => {
  for (const option of [{ draft: true }, { legacy: true }]) {
    const f = await fixture(option);
    await fail(f.pk.pack(f.s, body(f.a)), "PACKAGING_BLOCKED");
    assert.equal((await f.pk.list(f.s)).items.length, 0);
  }
});
test("one active package locks disassembly; explicit void preserves history and releases only package lock", async () => {
  const f = await fixture(),
    x = await f.pk.pack(f.s, body(f.a));
  await fail(
    f.pk.pack(f.s, body(f.a, { code: "PACK-2" })),
    "PACKAGING_BLOCKED",
  );
  await fail(
    f.tr.transition(f.s, f.a.id, {
      requestId: randomUUID(),
      version: f.a.version,
      action: "disassemble",
      confirmed: true,
      reason: "Demo",
    }),
    "PACKAGING_BLOCKED",
  );
  const v = await f.pk.void(f.s, x.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Demo label correction",
    confirmed: true,
  });
  assert.equal(v.state, "voided");
  assert.equal((await f.pk.get(f.s, x.id, 1)).state, "packaged");
  assert.equal((await f.pk.history(f.s, x.id)).items.length, 2);
  assert.equal((await f.ir.get(f.s, f.i.id)).activeAssembly.assemblyId, f.a.id);
  const newPack = await f.pk.pack(f.s, body(f.a, { code: "PACK-2" }));
  assert.equal(newPack.state, "packaged");
});
test("packaging rejects stale versions and omitted confirmations; idempotent replay cannot change content", async () => {
  const f = await fixture();
  for (const patch of [
    { sealChecked: false },
    { contentsChecked: false },
    { confirmed: false },
    { materialLot: "" },
  ])
    await fail(f.pk.pack(f.s, body(f.a, patch)), "INVALID_REQUEST");
  await fail(f.pk.pack(f.s, body(f.a, { assemblyVersion: 1 })), "CONFLICT");
  const b = body(f.a),
    x = await f.pk.pack(f.s, b);
  assert.deepEqual(await f.pk.pack(f.s, b), x);
  await fail(f.pk.pack(f.s, { ...b, materialLot: "DIFFERENT" }), "CONFLICT");
  await fail(
    f.pk.void(f.s, x.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "",
      confirmed: true,
    }),
    "INVALID_REQUEST",
  );
});
test("packaging scope prevents foreign reads, history, mutations and assembly use", async () => {
  const f = await fixture(),
    x = await f.pk.pack(f.s, body(f.a));
  for (const s of [
    { ...f.s, facilityId: randomUUID() },
    { ...f.s, tenantId: randomUUID() },
  ]) {
    assert.equal((await f.pk.list(s)).items.length, 0);
    await fail(f.pk.get(s, x.id), "NOT_FOUND");
    await fail(f.pk.get(s, x.id, 1), "NOT_FOUND");
    await fail(f.pk.history(s, x.id), "NOT_FOUND");
    await fail(f.pk.pack(s, body(f.a)), "NOT_FOUND");
    await fail(
      f.pk.void(s, x.id, {
        requestId: randomUUID(),
        version: 1,
        reason: "Demo",
        confirmed: true,
      }),
      "NOT_FOUND",
    );
  }
});
test("package creation and void audit failures roll back locks, versions and retry receipts", async () => {
  const f = await fixture(),
    b = body(f.a);
  f.repo.failAudit = true;
  await assert.rejects(f.pk.pack(f.s, b));
  f.repo.failAudit = false;
  assert.equal((await f.pk.list(f.s)).items.length, 0);
  const x = await f.pk.pack(f.s, b);
  f.repo.failAudit = true;
  await assert.rejects(
    f.pk.void(f.s, x.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Demo",
      confirmed: true,
    }),
  );
  f.repo.failAudit = false;
  assert.equal((await f.pk.get(f.s, x.id)).state, "packaged");
  await fail(f.pk.get(f.s, x.id, 2), "NOT_FOUND");
  await fail(
    f.pk.pack(f.s, body(f.a, { code: "PACK-2" })),
    "PACKAGING_BLOCKED",
  );
});
test("concurrent packaging accepts only one claimant without changing the losing request", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.pk.pack(f.s, body(f.a)),
    f.pk.pack(f.s, body(f.a, { code: "PACK-2" })),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    results.find((x) => x.status === "rejected").reason.code,
    "PACKAGING_BLOCKED",
  );
});
test("packaging rejects inspection recorded after the saved assembly completion", async () => {
  const f = await fixture();
  f.repo.state.assemblies.find((x) => x.id === f.a.id).completedAt =
    "2000-01-01T00:00:00.000Z";
  await fail(f.pk.pack(f.s, body(f.a)), "PACKAGING_BLOCKED");
});

async function fundLots(f, lots, quantity = 20) {
  const { ConsumableStockRegistry } = await import("../dist/index.js");
  for (const lot of lots)
    await new ConsumableStockRegistry(f.repo).record(f.s, lot.id, "receive", {
      requestId: randomUUID(),
      version: 0,
      quantity,
      reason: "SIMULATED receipt",
      reference: "DELIVERY",
      confirmed: true,
    });
}
async function fundAndPack(f, lots, input) {
  await fundLots(f, lots);
  return f.pk.pack(f.s, input);
}
const lotInput = (extra = {}) => ({
  requestId: randomUUID(),
  code: "LOT-" + randomUUID(),
  kind: "wrap",
  name: "DEMO WRAP",
  lotNumber: "LOT-1",
  supplier: "DEMO supplier",
  supplierReference: "DEMO delivery",
  expiresOn: new Date().toISOString().slice(0, 10),
  confirmed: true,
  ...extra,
});
test("consumable registration validates dates, scopes duplicate codes and retries atomically", async () => {
  const { ConsumableRegistry } = await import("../dist/index.js"),
    f = await fixture(),
    r = new ConsumableRegistry(f.repo),
    input = lotInput(),
    lot = await r.register(f.s, input);
  assert.deepEqual(await r.register(f.s, input), lot);
  assert.equal(
    f.repo.state.audit.filter((x) => x.action === "consumable-registered")
      .length,
    1,
  );
  await fail(
    r.register(f.s, { ...input, requestId: randomUUID() }),
    "CONFLICT",
  );
  for (const extra of [
    { expiresOn: "2026-02-30" },
    { expiresOn: "2026-1-01" },
    { kind: "unknown" },
    { confirmed: false },
    { supplier: "" },
  ])
    await fail(r.register(f.s, lotInput(extra)), "INVALID_REQUEST");
  assert.equal(
    (await r.list({ ...f.s, facilityId: randomUUID() })).items.length,
    0,
  );
  await fail(r.detail({ ...f.s, tenantId: randomUUID() }, lot.id), "NOT_FOUND");
  f.repo.failAudit = true;
  await assert.rejects(r.register(f.s, lotInput()));
  assert.equal(f.repo.state.consumables.length, 1);
});
test("packaging freezes primary and indicator lots, inclusive expiry and immutable saved supplier references", async () => {
  const { ConsumableRegistry } = await import("../dist/index.js"),
    f = await fixture(),
    r = new ConsumableRegistry(f.repo),
    lot = await r.register(f.s, lotInput()),
    indicator = await r.register(f.s, lotInput({ kind: "indicator" }));
  const p = await fundAndPack(
    f,
    [lot, indicator],
    body(f.a, { consumableLotIds: [lot.id, indicator.id] }),
  );
  assert.deepEqual(p.consumableLots, [lot, indicator]);
  const { TraceabilityRegistry } = await import("../dist/index.js");
  const traced = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "package",
    p.id,
  );
  assert.ok(
    traced.nodes.some((n) =>
      n.snapshots.some((s) =>
        s.facts.some(
          (x) =>
            x.kind === "consumable_lot" &&
            x.fields.some(
              (f) =>
                f.key === "supplierReference" &&
                f.value === lot.supplierReference,
            ),
        ),
      ),
    ),
  );
  assert.equal((await r.packages(f.s, lot.id)).items[0].id, p.id);
  await fail(
    r.packages({ ...f.s, facilityId: randomUUID() }, lot.id),
    "NOT_FOUND",
  );
  f.repo.state.consumables[0].supplier = "later catalogue change";
  assert.equal(
    (await f.pk.get(f.s, p.id)).consumableLots[0].supplier,
    lot.supplier,
  );
  assert.equal(
    (await f.pk.get(f.s, p.id, 1)).consumableLots[0].supplier,
    lot.supplier,
  );
});
test("packaging rejects expired, foreign, duplicate, indicator-only and mismatched lots without writing", async () => {
  const { ConsumableRegistry } = await import("../dist/index.js"),
    f = await fixture(),
    r = new ConsumableRegistry(f.repo),
    lot = await r.register(f.s, lotInput()),
    expired = await r.register(f.s, lotInput({ expiresOn: "2020-01-01" })),
    indicator = await r.register(f.s, lotInput({ kind: "indicator" })),
    foreign = await r.register(
      { ...f.s, facilityId: randomUUID() },
      lotInput(),
    );
  for (const [ids, code] of [
    [[expired.id], "CONSUMABLE_EXPIRED"],
    [[foreign.id], "NOT_FOUND"],
    [[lot.id, lot.id], "INVALID_REQUEST"],
    [[indicator.id], "INVALID_REQUEST"],
    [[], "INVALID_REQUEST"],
  ])
    await fail(f.pk.pack(f.s, body(f.a, { consumableLotIds: ids })), code);
  await fail(
    f.pk.pack(
      f.s,
      body(f.a, { consumableLotIds: [lot.id], materialLot: "different" }),
    ),
    "INVALID_REQUEST",
  );
  assert.equal(f.repo.state.packages.length, 0);
  await fundLots(f, [lot]);
  f.repo.failAudit = true;
  await assert.rejects(
    f.pk.pack(f.s, body(f.a, { consumableLotIds: [lot.id] })),
  );
  assert.equal(f.repo.state.packages.length, 0);
});

test("lot withdrawal is versioned, idempotent, permanent and blocks new packing without changing saved packages", async () => {
  const { ConsumableRegistry } = await import("../dist/index.js"),
    f = await fixture(),
    r = new ConsumableRegistry(f.repo),
    lot = await r.register(f.s, lotInput()),
    p = await fundAndPack(f, [lot], body(f.a, { consumableLotIds: [lot.id] })),
    input = {
      requestId: randomUUID(),
      version: 1,
      reason: "SIMULATED defect",
      reference: "SIMULATED supplier notice",
      confirmed: true,
    };
  const withdrawn = await r.withdraw(f.s, lot.id, input);
  assert.equal(withdrawn.version, 2);
  assert.equal(withdrawn.withdrawal.reference, input.reference);
  assert.deepEqual(await r.withdraw(f.s, lot.id, input), withdrawn);
  assert.equal(
    (await f.pk.get(f.s, p.id)).consumableLots[0].withdrawal,
    undefined,
  );
  assert.equal((await f.pk.get(f.s, p.id)).recall, undefined);
  await fail(
    r.withdraw(f.s, lot.id, { ...input, requestId: randomUUID() }),
    "CONFLICT",
  );
  const { resolveConsumables } = await import("../dist/consumables.js");
  await fail(
    f.repo.transaction(f.s, (tx) =>
      resolveConsumables(tx, [lot.id], new Date().toISOString()),
    ),
    "CONSUMABLE_WITHDRAWN",
  );
  await fail(
    r.withdraw({ ...f.s, facilityId: randomUUID() }, lot.id, {
      ...input,
      requestId: randomUUID(),
    }),
    "NOT_FOUND",
  );
});
test("withdrawn lot recall requires exact package provenance and current preview, creates durable existing blocks and atomic association", async () => {
  const { ConsumableRegistry, RecallRegistry } =
      await import("../dist/index.js"),
    f = await fixture(),
    r = new ConsumableRegistry(f.repo),
    lot = await r.register(f.s, lotInput()),
    other = await r.register(f.s, lotInput()),
    p = await fundAndPack(f, [lot], body(f.a, { consumableLotIds: [lot.id] })),
    decision = {
      requestId: randomUUID(),
      version: 1,
      reason: "SIMULATED defect",
      reference: "NOTICE",
      confirmed: true,
    };
  await fail(r.recallPreview(f.s, lot.id, p.id), "CONFLICT");
  await r.withdraw(f.s, lot.id, decision);
  await r.withdraw(f.s, other.id, { ...decision, requestId: randomUUID() });
  await fail(r.recallPreview(f.s, other.id, p.id), "CONFLICT");
  const impact = await r.recallPreview(f.s, lot.id, p.id),
    input = {
      ...decision,
      requestId: randomUUID(),
      version: 2,
      packageId: p.id,
      impactHash: impact.impactHash,
      code: "LOT-RECALL",
    };
  await fail(
    r.createRecall(f.s, lot.id, { ...input, confirmed: false }),
    "INVALID_REQUEST",
  );
  await fail(r.createRecall(f.s, lot.id, { ...input, version: 1 }), "CONFLICT");
  await fail(
    r.createRecall(f.s, lot.id, { ...input, impactHash: "a".repeat(64) }),
    "CONFLICT",
  );
  f.repo.failAudit = true;
  await assert.rejects(r.createRecall(f.s, lot.id, input));
  assert.equal(f.repo.state.recalls.length, 0);
  assert.equal((await r.detail(f.s, lot.id)).version, 2);
  f.repo.failAudit = false;
  const saved = await r.createRecall(f.s, lot.id, input);
  assert.equal(saved.version, 3);
  assert.equal(saved.recalls.length, 1);
  assert.deepEqual(await r.createRecall(f.s, lot.id, input), saved);
  const recall = await new RecallRegistry(f.repo).get(f.s, saved.recalls[0].id);
  assert.equal(recall.consumableLot.id, lot.id);
  assert.equal((await f.pk.get(f.s, p.id)).recall.caseId, recall.id);
  assert.equal(f.repo.state.recallInstruments.length, 1);
  await fail(
    r.createRecall(f.s, lot.id, {
      ...input,
      requestId: randomUUID(),
      version: 3,
    }),
    "CONFLICT",
  );
});
test("lot withdrawal validation and audit failures leave the original lot unchanged", async () => {
  const { ConsumableRegistry } = await import("../dist/index.js"),
    f = await fixture(),
    r = new ConsumableRegistry(f.repo),
    lot = await r.register(f.s, lotInput()),
    input = {
      requestId: randomUUID(),
      version: 1,
      reason: "SIMULATED",
      reference: "NOTICE",
      confirmed: true,
    };
  for (const extra of [
    { confirmed: false },
    { reason: "" },
    { reference: "" },
    { version: 0 },
  ])
    await fail(
      r.withdraw(f.s, lot.id, { ...input, ...extra }),
      "INVALID_REQUEST",
    );
  f.repo.failAudit = true;
  await assert.rejects(r.withdraw(f.s, lot.id, input));
  assert.deepEqual(await r.detail(f.s, lot.id), lot);
});

test("stock receipts, quarantine and disposal conserve balances and preserve an immutable versioned ledger", async () => {
  const { ConsumableRegistry, ConsumableStockRegistry } =
      await import("../dist/index.js"),
    f = await fixture(),
    lot = await new ConsumableRegistry(f.repo).register(f.s, lotInput()),
    r = new ConsumableStockRegistry(f.repo),
    input = {
      requestId: randomUUID(),
      version: 0,
      quantity: 10,
      reason: "SIMULATED receipt",
      reference: "DELIVERY",
      confirmed: true,
    };
  const first = await r.record(f.s, lot.id, "receive", input);
  assert.equal(first.balance.available, 10);
  assert.deepEqual(await r.record(f.s, lot.id, "receive", input), first);
  await r.record(f.s, lot.id, "quarantine", {
    ...input,
    requestId: randomUUID(),
    version: 1,
    quantity: 3,
  });
  await r.record(f.s, lot.id, "discard_quarantined", {
    ...input,
    requestId: randomUUID(),
    version: 2,
    quantity: 2,
  });
  await r.record(f.s, lot.id, "discard", {
    ...input,
    requestId: randomUUID(),
    version: 3,
    quantity: 1,
  });
  const report = await r.report(f.s, lot.id);
  assert.equal(report.balance.available, 6);
  assert.equal(report.balance.quarantined, 1);
  assert.equal(report.balance.discarded, 3);
  assert.equal(report.balance.received, 10);
  assert.equal(report.movements.items.length, 4);
  assert.equal(report.movements.items.at(-1).balance.available, 10);
  await fail(
    r.record(f.s, lot.id, "receive", { ...input, requestId: randomUUID() }),
    "CONFLICT",
  );
  await fail(
    r.record(f.s, lot.id, "quarantine", {
      ...input,
      requestId: randomUUID(),
      version: 4,
      quantity: 7,
    }),
    "INSUFFICIENT_STOCK",
  );
  await fail(
    r.report({ ...f.s, facilityId: randomUUID() }, lot.id),
    "NOT_FOUND",
  );
  for (const quantity of [0, -1, 0.5, NaN, 1000000001])
    await fail(
      r.record(f.s, lot.id, "receive", { ...input, quantity }),
      "INVALID_REQUEST",
    );
});
test("packaging deducts each selected lot once, retry/void preserve usage and overspend or missing quantities cannot save", async () => {
  const { ConsumableRegistry, ConsumableStockRegistry } =
      await import("../dist/index.js"),
    f = await fixture(),
    lot = await new ConsumableRegistry(f.repo).register(f.s, lotInput()),
    r = new ConsumableStockRegistry(f.repo);
  await fundLots(f, [lot], 3);
  const input = body(f.a, {
    consumableLotIds: [lot.id],
    consumableUsage: [{ lotId: lot.id, quantity: 2 }],
  });
  await fail(
    f.pk.pack(f.s, { ...input, consumableUsage: undefined }),
    "INVALID_REQUEST",
  );
  await fail(
    f.pk.pack(f.s, {
      ...input,
      consumableUsage: [{ lotId: lot.id, quantity: 4 }],
    }),
    "INSUFFICIENT_STOCK",
  );
  assert.equal((await r.report(f.s, lot.id)).balance.available, 3);
  const p = await f.pk.pack(f.s, input);
  assert.equal(p.consumableUsage[0].quantity, 2);
  assert.deepEqual(await f.pk.pack(f.s, input), p);
  assert.equal((await r.report(f.s, lot.id)).balance.available, 1);
  assert.equal((await r.report(f.s, lot.id)).movements.items.length, 2);
  const { TraceabilityRegistry } = await import("../dist/index.js");
  const trace = await new TraceabilityRegistry(f.repo).report(
    f.s,
    "package",
    p.id,
  );
  assert.ok(
    trace.nodes.some((n) =>
      n.snapshots.some((s) =>
        s.facts.some((f) => f.kind === "consumable_usage"),
      ),
    ),
  );
  await f.pk.void(f.s, p.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "SIMULATED damaged wrap",
    confirmed: true,
  });
  assert.equal((await r.report(f.s, lot.id)).balance.used, 2);
  assert.equal((await r.report(f.s, lot.id)).balance.available, 1);
  assert.equal((await f.pk.get(f.s, p.id, 1)).consumableUsage[0].quantity, 2);
});
test("stock and package multi-lot writes roll back together on insufficient indicator or audit failure", async () => {
  const { ConsumableRegistry, ConsumableStockRegistry } =
      await import("../dist/index.js"),
    f = await fixture(),
    reg = new ConsumableRegistry(f.repo),
    lot = await reg.register(f.s, lotInput()),
    indicator = await reg.register(f.s, lotInput({ kind: "indicator" })),
    r = new ConsumableStockRegistry(f.repo);
  await fundLots(f, [lot], 3);
  const input = body(f.a, { consumableLotIds: [lot.id, indicator.id] });
  await fail(f.pk.pack(f.s, input), "INSUFFICIENT_STOCK");
  assert.equal((await r.report(f.s, lot.id)).balance.available, 3);
  await fundLots(f, [indicator], 1);
  f.repo.failAudit = true;
  await assert.rejects(f.pk.pack(f.s, input));
  assert.equal((await r.report(f.s, lot.id)).balance.available, 3);
  assert.equal(f.repo.state.packages.length, 0);
  assert.equal(f.repo.state.consumableStockMovements.length, 2);
});

test("consumable alert boundaries use inclusive UTC expiry and configured minimum without inferring quantities", async () => {
  const { consumableAlert } = await import("../dist/index.js"),
    lot = { expiresOn: "2026-11-17" },
    stock = { available: 5 },
    at = "2026-11-10T23:59:59.999Z";
  assert.equal(consumableAlert(lot, stock, at).expiry, "expiring");
  assert.equal(
    consumableAlert({ ...lot, expiresOn: "2026-11-18" }, stock, at),
    null,
  );
  assert.equal(
    consumableAlert({ ...lot, expiresOn: "2026-11-10" }, stock, at).expiry,
    "expiring",
  );
  assert.equal(
    consumableAlert({ ...lot, expiresOn: "2026-11-09" }, stock, at).expiry,
    "expired",
  );
  assert.equal(consumableAlert(lot, { available: 0 }, at), null);
  assert.equal(
    consumableAlert({ ...lot, withdrawal: { at } }, stock, at),
    null,
  );
  const policy = { minimumStock: 5, warningDays: 7 };
  assert.equal(
    consumableAlert({ ...lot, alertPolicy: policy }, stock, at).lowStock,
    true,
  );
  assert.equal(
    consumableAlert({ ...lot, alertPolicy: policy }, { available: 6 }, at)
      .lowStock,
    false,
  );
  assert.equal(
    consumableAlert(
      { ...lot, alertPolicy: { ...policy, minimumStock: 0 } },
      null,
      at,
    ).stockRecorded,
    false,
  );
});
test("reviewer alert settings preserve stock, reject stale/invalid scope and roll back with audit failures", async () => {
  const { ConsumableRegistry, ConsumableAlertRegistry, DashboardRegistry } =
      await import("../dist/index.js"),
    f = await fixture(),
    r = new ConsumableAlertRegistry(f.repo),
    lot = await new ConsumableRegistry(f.repo).register(
      f.s,
      lotInput({ expiresOn: "2099-01-01" }),
    );
  await fundLots(f, [lot], 5);
  const input = {
      requestId: randomUUID(),
      version: 1,
      minimumStock: 5,
      warningDays: 7,
      reason: "SIMULATED threshold",
      reference: "POLICY",
      confirmed: true,
    },
    saved = await r.configure(f.s, lot.id, input);
  assert.equal(saved.version, 2);
  assert.deepEqual(await r.configure(f.s, lot.id, input), saved);
  assert.equal(f.repo.state.consumableStock[0].available, 5);
  let queue = await new DashboardRegistry(f.repo).queue(
    f.s,
    "consumableAlerts",
  );
  assert.equal(queue.queue.total, 1);
  assert.equal(queue.queue.items[0].consumableAlert.minimumStock, 5);
  await fail(
    r.configure(f.s, lot.id, { ...input, requestId: randomUUID() }),
    "CONFLICT",
  );
  for (const extra of [
    { minimumStock: -1 },
    { minimumStock: 1.5 },
    { warningDays: 0 },
    { warningDays: 366 },
    { confirmed: false },
    { reference: "" },
  ])
    await fail(
      r.configure(f.s, lot.id, { ...input, ...extra }),
      "INVALID_REQUEST",
    );
  await fail(
    r.configure({ ...f.s, facilityId: randomUUID() }, lot.id, input),
    "NOT_FOUND",
  );
  f.repo.failAudit = true;
  await assert.rejects(
    r.configure(f.s, lot.id, {
      ...input,
      requestId: randomUUID(),
      version: 2,
      minimumStock: 1,
    }),
  );
  f.repo.failAudit = false;
  assert.equal(
    (await new ConsumableRegistry(f.repo).detail(f.s, lot.id)).version,
    2,
  );
  await r.configure(f.s, lot.id, {
    ...input,
    requestId: randomUUID(),
    version: 2,
    minimumStock: null,
  });
  queue = await new DashboardRegistry(f.repo).queue(f.s, "consumableAlerts");
  assert.equal(queue.queue.total, 0);
});

test("physical counts preserve stock until independent approval records a signed adjustment and immutable evidence", async () => {
  const {
      ConsumableRegistry,
      ConsumableStockRegistry,
      StockReconciliationRegistry,
    } = await import("../dist/index.js"),
    f = await fixture(),
    lot = await new ConsumableRegistry(f.repo).register(f.s, lotInput()),
    stock = new ConsumableStockRegistry(f.repo),
    r = new StockReconciliationRegistry(f.repo),
    reviewer = { ...f.s, actorId: randomUUID() };
  await fundLots(f, [lot], 10);
  const input = {
      requestId: randomUUID(),
      stockVersion: 1,
      countedAvailable: 8,
      reason: "SIMULATED count",
      reference: "COUNT-EVIDENCE",
      confirmed: true,
    },
    count = await r.record(f.s, lot.id, input);
  assert.equal(count.difference, -2);
  assert.equal((await stock.report(f.s, lot.id)).balance.available, 10);
  assert.deepEqual(await r.record(f.s, lot.id, input), count);
  const decision = {
    requestId: randomUUID(),
    version: 1,
    reason: "SIMULATED approved",
    reference: "REVIEW",
    confirmed: true,
  };
  await fail(r.decide(f.s, lot.id, count.id, "approve", decision), "CONFLICT");
  const approved = await r.decide(
    reviewer,
    lot.id,
    count.id,
    "approve",
    decision,
  );
  assert.equal(approved.state, "approved");
  assert.deepEqual(
    await r.decide(reviewer, lot.id, count.id, "approve", decision),
    approved,
  );
  const report = await stock.report(f.s, lot.id);
  assert.equal(report.balance.available, 8);
  assert.equal(report.balance.received, 10);
  assert.equal(report.balance.adjustments, -2);
  assert.equal(report.movements.items[0].stockCountId, count.id);
  assert.equal(report.movements.items[0].quantity, -2);
  assert.equal(report.movements.items.at(-1).balance.available, 10);
  await fail(
    r.decide(reviewer, lot.id, count.id, "approve", {
      ...decision,
      requestId: randomUUID(),
    }),
    "CONFLICT",
  );
});
test("intervening stock movements require rejection and recount; positive and zero adjustments preserve conservation", async () => {
  const {
      ConsumableRegistry,
      ConsumableStockRegistry,
      StockReconciliationRegistry,
    } = await import("../dist/index.js"),
    f = await fixture(),
    lot = await new ConsumableRegistry(f.repo).register(f.s, lotInput()),
    stock = new ConsumableStockRegistry(f.repo),
    r = new StockReconciliationRegistry(f.repo),
    reviewer = { ...f.s, actorId: randomUUID() },
    countInput = {
      requestId: randomUUID(),
      stockVersion: 1,
      countedAvailable: 8,
      reason: "SIMULATED count",
      reference: "COUNT",
      confirmed: true,
    },
    decision = {
      requestId: randomUUID(),
      version: 1,
      reason: "REVIEW",
      reference: "EVIDENCE",
      confirmed: true,
    };
  await fundLots(f, [lot], 10);
  const old = await r.record(f.s, lot.id, countInput);
  await stock.record(f.s, lot.id, "receive", {
    requestId: randomUUID(),
    version: 1,
    quantity: 2,
    reason: "NEW DELIVERY",
    reference: "REF",
    confirmed: true,
  });
  await fail(
    r.decide(reviewer, lot.id, old.id, "approve", decision),
    "CONFLICT",
  );
  await r.decide(reviewer, lot.id, old.id, "reject", {
    ...decision,
    requestId: randomUUID(),
  });
  assert.equal((await stock.report(f.s, lot.id)).balance.available, 12);
  const count = await r.record(f.s, lot.id, {
    ...countInput,
    requestId: randomUUID(),
    stockVersion: 2,
    countedAvailable: 14,
  });
  await r.decide(reviewer, lot.id, count.id, "approve", {
    ...decision,
    requestId: randomUUID(),
  });
  let report = await stock.report(f.s, lot.id);
  assert.equal(report.balance.available, 14);
  assert.equal(report.balance.adjustments, 2);
  const zero = await r.record(f.s, lot.id, {
      ...countInput,
      requestId: randomUUID(),
      stockVersion: 3,
      countedAvailable: 14,
    }),
    approved = await r.decide(reviewer, lot.id, zero.id, "approve", {
      ...decision,
      requestId: randomUUID(),
    });
  assert.equal(approved.decision.movementId, null);
  report = await stock.report(f.s, lot.id);
  assert.equal(report.balance.version, 3);
  assert.equal(report.movements.items.length, 3);
});
test("count validation, pending uniqueness, scope and approval audit rollback protect stock and count decisions", async () => {
  const {
      ConsumableRegistry,
      ConsumableStockRegistry,
      StockReconciliationRegistry,
    } = await import("../dist/index.js"),
    f = await fixture(),
    lot = await new ConsumableRegistry(f.repo).register(f.s, lotInput()),
    r = new StockReconciliationRegistry(f.repo),
    reviewer = { ...f.s, actorId: randomUUID() },
    input = {
      requestId: randomUUID(),
      stockVersion: 1,
      countedAvailable: 0,
      reason: "SIMULATED zero count",
      reference: "COUNT",
      confirmed: true,
    };
  await fundLots(f, [lot], 10);
  for (const extra of [
    { countedAvailable: -1 },
    { countedAvailable: 0.5 },
    { confirmed: false },
    { reference: "" },
  ])
    await fail(
      r.record(f.s, lot.id, { ...input, ...extra }),
      "INVALID_REQUEST",
    );
  const count = await r.record(f.s, lot.id, input);
  await fail(
    r.record(f.s, lot.id, { ...input, requestId: randomUUID() }),
    "CONFLICT",
  );
  await fail(r.list({ ...f.s, facilityId: randomUUID() }, lot.id), "NOT_FOUND");
  const decision = {
    requestId: randomUUID(),
    version: 1,
    reason: "REVIEW",
    reference: "REF",
    confirmed: true,
  };
  await fail(
    r.decide(reviewer, randomUUID(), count.id, "approve", decision),
    "NOT_FOUND",
  );
  f.repo.failAudit = true;
  await assert.rejects(
    r.decide(reviewer, lot.id, count.id, "approve", decision),
  );
  assert.equal(
    (await new ConsumableStockRegistry(f.repo).report(f.s, lot.id)).balance
      .available,
    10,
  );
  assert.equal((await r.list(f.s, lot.id)).items[0].state, "pending");
  f.repo.failAudit = false;
  const approved = await r.decide(
    reviewer,
    lot.id,
    count.id,
    "approve",
    decision,
  );
  assert.equal(approved.state, "approved");
  assert.equal(f.repo.state.consumableStock[0].available, 0);
});

test("replenishment targets are optional, bounded and derive suggestions only for eligible low stock", async () => {
  const { ConsumableRegistry, ConsumableAlertRegistry, consumableAlert } =
    await import("../dist/index.js");
  const f = await fixture(),
    lot = await new ConsumableRegistry(f.repo).register(
      f.s,
      lotInput({ expiresOn: "2099-01-01" }),
    );
  await fundLots(f, [lot], 5);
  const r = new ConsumableAlertRegistry(f.repo),
    input = {
      requestId: randomUUID(),
      version: 1,
      minimumStock: 10,
      targetStock: 20,
      warningDays: 7,
      reason: "SIMULATED replenishment",
      reference: "POLICY",
      confirmed: true,
    };
  for (const extra of [
    { targetStock: 9 },
    { targetStock: -1 },
    { targetStock: 1.5 },
    { targetStock: 1000000001 },
    { minimumStock: null },
    { targetStock: "20" },
  ])
    await fail(
      r.configure(f.s, lot.id, { ...input, ...extra }),
      "INVALID_REQUEST",
    );
  const saved = await r.configure(f.s, lot.id, input);
  assert.equal(saved.alertPolicy.targetStock, 20);
  assert.deepEqual(await r.configure(f.s, lot.id, input), saved);
  assert.equal(f.repo.state.consumableStock[0].available, 5);
  const alert = consumableAlert(
    saved,
    { available: 5 },
    "2026-11-10T00:00:00Z",
  );
  assert.equal(alert.suggestedQuantity, 15);
  assert.equal(
    consumableAlert(saved, { available: 10 }, "2026-11-10T00:00:00Z")
      .suggestedQuantity,
    10,
  );
  assert.equal(
    consumableAlert(saved, { available: 11 }, "2026-11-10T00:00:00Z"),
    null,
  );
  assert.equal(
    consumableAlert(
      { ...saved, expiresOn: "2026-11-09" },
      { available: 5 },
      "2026-11-10T00:00:00Z",
    ).suggestedQuantity,
    null,
  );
  assert.equal(
    consumableAlert({ ...saved, withdrawal: {} }, { available: 5 }),
    null,
  );
  assert.equal(
    consumableAlert(
      { ...saved, alertPolicy: { ...saved.alertPolicy, targetStock: null } },
      { available: 5 },
    ).suggestedQuantity,
    null,
  );
  assert.equal(
    consumableAlert(saved, null, "2026-11-10T00:00:00Z").suggestedQuantity,
    20,
  );
  const cleared = await r.configure(f.s, lot.id, {
    ...input,
    requestId: randomUUID(),
    version: 2,
    targetStock: null,
  });
  assert.equal(cleared.alertPolicy.targetStock, null);
});

test("expired empty lots never suggest replenishing their registered lot", async () => {
  const { consumableAlert } = await import("../dist/index.js");
  const lot = {
    expiresOn: "2026-11-09",
    alertPolicy: { minimumStock: 10, targetStock: 20, warningDays: 7 },
  };
  assert.equal(
    consumableAlert(lot, { available: 0 }, "2026-11-10T00:00:00Z")
      .suggestedQuantity,
    null,
  );
});

test("replenishment report includes every low-stock lot beyond catalogue paging with stable supplier ordering and no writes", async () => {
  const { ReplenishmentRegistry, ConsumableRegistry, ConsumableAlertRegistry } =
    await import("../dist/index.js");
  const f = await fixture(),
    lots = new ConsumableRegistry(f.repo),
    policy = new ConsumableAlertRegistry(f.repo);
  for (let i = 0; i < 53; i++) {
    const lot = await lots.register(
      f.s,
      lotInput({
        code: "PLAN-" + String(i).padStart(3, "0"),
        supplier: i % 2 ? "B" : "A",
        expiresOn: i === 0 ? "2020-01-01" : "2099-01-01",
      }),
    );
    await policy.configure(f.s, lot.id, {
      requestId: randomUUID(),
      version: 1,
      minimumStock: 10,
      targetStock: i === 1 ? null : 20,
      warningDays: 7,
      reason: "SIMULATED plan",
      reference: "POLICY",
      confirmed: true,
    });
  }
  const before = structuredClone(f.repo.state),
    registry = new ReplenishmentRegistry(f.repo),
    report = await registry.get(f.s);
  assert.equal(report.items.length, 53);
  assert.equal(new Set(report.items.map((x) => x.lotId)).size, 53);
  assert.equal(report.items[0].code, "PLAN-000");
  assert.equal(report.items[0].status, "expired");
  assert.equal(report.items[0].suggestedQuantity, null);
  assert.equal(
    report.items.find((x) => x.code === "PLAN-001").status,
    "target_not_set",
  );
  assert.equal(
    report.items.find((x) => x.code === "PLAN-052").suggestedQuantity,
    20,
  );
  assert.equal(report.items[0].stockRecorded, false);
  assert.deepEqual(f.repo.state, before);
  assert.equal(
    (await registry.get({ ...f.s, facilityId: randomUUID() })).items.length,
    0,
  );
  assert.deepEqual((await registry.get(f.s)).items, report.items);
});

test("dated stock movement report preserves all actions, signed deltas, saved balances and source evidence without writes", async () => {
  const {
      ConsumableRegistry,
      ConsumableStockRegistry,
      StockReconciliationRegistry,
      StockMovementReportRegistry,
      consumeStock,
    } = await import("../dist/index.js"),
    f = await fixture(),
    lots = new ConsumableRegistry(f.repo),
    lot = await lots.register(f.s, lotInput()),
    stock = new ConsumableStockRegistry(f.repo);
  await fundLots(f, [lot], 20);
  const pkg = { id: randomUUID(), code: "SIMULATED-PACKAGE" };
  await f.repo.transaction(f.s, (tx) =>
    consumeStock(
      tx,
      f.s,
      [lot],
      [{ lotId: lot.id, quantity: 2 }],
      new Date().toISOString(),
      randomUUID(),
      pkg,
    ),
  );
  for (const [action, version, quantity] of [
    ["quarantine", 2, 3],
    ["discard", 3, 1],
    ["discard_quarantined", 4, 2],
  ])
    await stock.record(f.s, lot.id, action, {
      requestId: randomUUID(),
      version,
      quantity,
      reason: "SIMULATED " + action,
      reference: "EVIDENCE",
      confirmed: true,
    });
  const counts = new StockReconciliationRegistry(f.repo),
    count = await counts.record(f.s, lot.id, {
      requestId: randomUUID(),
      stockVersion: 5,
      countedAvailable: 12,
      reason: "SIMULATED count",
      reference: "COUNT",
      confirmed: true,
    });
  await counts.decide(
    { ...f.s, actorId: randomUUID() },
    lot.id,
    count.id,
    "approve",
    {
      requestId: randomUUID(),
      version: 1,
      reason: "SIMULATED review",
      reference: "REVIEW",
      confirmed: true,
    },
  );
  await lots.withdraw(f.s, lot.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "SIMULATED withdrawal",
    reference: "NOTICE",
    confirmed: true,
  });
  const before = structuredClone(f.repo.state),
    registry = new StockMovementReportRegistry(f.repo),
    from = new Date().toISOString().slice(0, 10),
    to = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    report = await registry.report(f.s, from, to);
  assert.deepEqual(
    report.items.map((x) => x.action),
    [
      "receive",
      "use",
      "quarantine",
      "discard",
      "discard_quarantined",
      "adjustment",
    ],
  );
  assert.deepEqual(
    report.items.map((x) => x.availableDelta),
    [20, -2, -3, -1, 0, -2],
  );
  assert.deepEqual(
    report.items.map((x) => x.balance.available),
    [20, 18, 15, 14, 14, 12],
  );
  assert.equal(report.items[1].packageId, pkg.id);
  assert.equal(report.items.at(-1).stockCountId, count.id);
  assert.equal(report.items.at(-1).quantity, -2);
  assert.equal(report.items[0].balance.available, 20);
  assert.deepEqual(f.repo.state, before);
  assert.equal(
    (await registry.report({ ...f.s, facilityId: randomUUID() }, from, to))
      .items.length,
    0,
  );
  for (const [a, b] of [
    ["2026-02-30", "2026-03-01"],
    [from, from],
    ["2025-01-01", "2026-01-01"],
    ["2099-01-01", "2099-01-02"],
    ["invalid", to],
  ])
    await fail(registry.report(f.s, a, b), "INVALID_REQUEST");
});
test("movement report includes UTC start, excludes end, and crosses movement and lot pagination", async () => {
  const {
      ConsumableRegistry,
      ConsumableStockRegistry,
      StockMovementReportRegistry,
    } = await import("../dist/index.js"),
    f = await fixture(),
    lots = new ConsumableRegistry(f.repo),
    stock = new ConsumableStockRegistry(f.repo);
  const lot = await lots.register(f.s, lotInput());
  for (let version = 0; version < 53; version++)
    await stock.record(f.s, lot.id, "receive", {
      requestId: randomUUID(),
      version,
      quantity: 1,
      reason: "SIMULATED receipt",
      reference: "REF",
      confirmed: true,
    });
  const scopeMovements = f.repo.state.consumableStockMovements.filter(
    (x) => x.lotId === lot.id,
  );
  scopeMovements.forEach(
    (x, i) =>
      (x.at =
        i === 52 ? "2026-11-02T00:00:00.000Z" : "2026-11-01T00:00:00.000Z"),
  );
  for (let i = 0; i < 51; i++) await lots.register(f.s, lotInput());
  const r = await new StockMovementReportRegistry(f.repo).report(
    f.s,
    "2026-11-01",
    "2026-11-02",
  );
  assert.equal(r.items.length, 52);
  assert.equal(new Set(r.items.map((x) => x.id)).size, 52);
  assert.equal(r.items[0].version, 1);
  assert.equal(r.items.at(-1).version, 52);
});

test("movement filters match exact canonical lot codes and action intersections without changing source history", async () => {
  const {
      ConsumableRegistry,
      ConsumableStockRegistry,
      StockMovementReportRegistry,
    } = await import("../dist/index.js"),
    f = await fixture(),
    lots = new ConsumableRegistry(f.repo),
    stock = new ConsumableStockRegistry(f.repo),
    a = await lots.register(f.s, lotInput({ code: "FILTER-A" })),
    b = await lots.register(f.s, lotInput({ code: "FILTER-AA" }));
  await fundLots(f, [a, b], 10);
  for (const lot of [a, b])
    await stock.record(f.s, lot.id, "quarantine", {
      requestId: randomUUID(),
      version: 1,
      quantity: 2,
      reason: "SIMULATED quarantine",
      reference: "EVIDENCE",
      confirmed: true,
    });
  const registry = new StockMovementReportRegistry(f.repo),
    from = new Date().toISOString().slice(0, 10),
    to = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    before = structuredClone(f.repo.state);
  const byLot = await registry.report(f.s, from, to, { lotCode: " filter-a " });
  assert.deepEqual(byLot.filters, { lotCode: "FILTER-A", action: null });
  assert.equal(byLot.items.length, 2);
  assert.ok(byLot.items.every((x) => x.lotId === a.id));
  const byAction = await registry.report(f.s, from, to, {
    action: "quarantine",
  });
  assert.equal(byAction.items.length, 2);
  assert.ok(byAction.items.every((x) => x.action === "quarantine"));
  const both = await registry.report(f.s, from, to, {
    lotCode: b.code,
    action: "quarantine",
  });
  assert.equal(both.items.length, 1);
  assert.equal(both.items[0].lotId, b.id);
  assert.equal(both.items[0].balance.available, 8);
  assert.equal(
    (await registry.report(f.s, from, to, { lotCode: "UNKNOWN" })).items.length,
    0,
  );
  assert.equal(
    (await registry.report(f.s, from, to, { action: "use" })).items.length,
    0,
  );
  assert.equal((await registry.report(f.s, from, to)).items.length, 4);
  for (const filters of [
    { lotCode: "" },
    { lotCode: "bad code" },
    { lotCode: "x".repeat(101) },
    { action: "unknown" },
    { action: "" },
    { action: null },
    { lotCode: null },
    { lotId: a.id },
    null,
  ])
    await fail(registry.report(f.s, from, to, filters), "INVALID_REQUEST");
  assert.deepEqual(f.repo.state, before);
});

test("current balance report preserves conservation, signed adjustments and recorded quantities while applying expiry/withdrawal usable rules", async () => {
  const {
      ConsumableRegistry,
      ConsumableStockRegistry,
      StockReconciliationRegistry,
      StockBalanceReportRegistry,
      consumeStock,
    } = await import("../dist/index.js"),
    f = await fixture(),
    lots = new ConsumableRegistry(f.repo),
    stock = new ConsumableStockRegistry(f.repo),
    counts = new StockReconciliationRegistry(f.repo),
    today = new Date().toISOString().slice(0, 10);
  const current = await lots.register(
      f.s,
      lotInput({ code: "BAL-CURRENT", expiresOn: today }),
    ),
    expired = await lots.register(
      f.s,
      lotInput({ code: "BAL-EXPIRED", expiresOn: "2020-01-01" }),
    ),
    withdrawn = await lots.register(f.s, lotInput({ code: "BAL-WITHDRAWN" })),
    untracked = await lots.register(f.s, lotInput({ code: "BAL-UNTRACKED" }));
  await fundLots(f, [current, withdrawn], 20);
  // Receipt on a past-expiry lot is rejected by normal stock gates; preserve a ledger that later expires.
  const expiredSource = await lots.register(
    f.s,
    lotInput({ code: "BAL-EXPIRING" }),
  );
  await fundLots(f, [expiredSource], 7);
  f.repo.state.consumables.find((x) => x.id === expiredSource.id).expiresOn =
    "2020-01-01";
  await f.repo.transaction(f.s, (tx) =>
    consumeStock(
      tx,
      f.s,
      [current],
      [{ lotId: current.id, quantity: 2 }],
      new Date().toISOString(),
      randomUUID(),
      { id: randomUUID(), code: "BAL-PACK" },
    ),
  );
  for (const [action, version, quantity] of [
    ["quarantine", 2, 3],
    ["discard", 3, 1],
    ["discard_quarantined", 4, 2],
  ])
    await stock.record(f.s, current.id, action, {
      requestId: randomUUID(),
      version,
      quantity,
      reason: "SIMULATED",
      reference: "EVIDENCE",
      confirmed: true,
    });
  const count = await counts.record(f.s, current.id, {
    requestId: randomUUID(),
    stockVersion: 5,
    countedAvailable: 12,
    reason: "COUNT",
    reference: "EVIDENCE",
    confirmed: true,
  });
  await counts.decide(
    { ...f.s, actorId: randomUUID() },
    current.id,
    count.id,
    "approve",
    {
      requestId: randomUUID(),
      version: 1,
      reason: "REVIEW",
      reference: "REF",
      confirmed: true,
    },
  );
  await lots.withdraw(f.s, withdrawn.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "WITHDRAW",
    reference: "REF",
    confirmed: true,
  });
  const before = structuredClone(f.repo.state),
    registry = new StockBalanceReportRegistry(f.repo),
    r = await registry.get(f.s),
    get = (id) => r.items.find((x) => x.lotId === id);
  assert.equal(r.items.length, 5);
  assert.equal(get(current.id).status, "current");
  assert.equal(get(current.id).usable, 12);
  assert.deepEqual(
    [
      get(current.id).received,
      get(current.id).used,
      get(current.id).quarantined,
      get(current.id).discarded,
      get(current.id).adjustments,
      get(current.id).available,
    ],
    [20, 2, 1, 3, -2, 12],
  );
  assert.equal(get(expiredSource.id).available, 7);
  assert.equal(get(expiredSource.id).usable, 0);
  assert.equal(get(expiredSource.id).status, "expired");
  assert.equal(get(withdrawn.id).available, 20);
  assert.equal(get(withdrawn.id).usable, 0);
  assert.equal(get(withdrawn.id).status, "withdrawn");
  assert.equal(get(withdrawn.id).withdrawn, true);
  assert.equal(get(untracked.id).stockRecorded, false);
  assert.equal(get(untracked.id).status, "untracked");
  assert.equal(get(untracked.id).stockVersion, null);
  assert.equal(get(untracked.id).lastMovementAt, null);
  assert.equal(get(untracked.id).received, 0);
  assert.equal(get(expired.id).status, "expired");
  assert.equal(get(expired.id).stockRecorded, false);
  for (const x of r.items)
    assert.equal(
      x.received + x.adjustments,
      x.available + x.used + x.quarantined + x.discarded,
    );
  assert.deepEqual(f.repo.state, before);
  assert.equal(
    (await registry.get({ ...f.s, facilityId: randomUUID() })).items.length,
    0,
  );
});
test("balance reports include every catalogue page with one stable row per lot and no fabricated ledger", async () => {
  const { ConsumableRegistry, StockBalanceReportRegistry } =
      await import("../dist/index.js"),
    f = await fixture(),
    lots = new ConsumableRegistry(f.repo);
  for (let i = 0; i < 53; i++)
    await lots.register(
      f.s,
      lotInput({ code: "BAL-" + String(i).padStart(3, "0") }),
    );
  const registry = new StockBalanceReportRegistry(f.repo),
    r = await registry.get(f.s);
  assert.equal(r.items.length, 53);
  assert.equal(new Set(r.items.map((x) => x.lotId)).size, 53);
  assert.equal(r.items[0].code, "BAL-000");
  assert.equal(r.items.at(-1).code, "BAL-052");
  assert.ok(
    r.items.every((x) => x.status === "untracked" && x.stockVersion === null),
  );
  assert.equal(f.repo.state.consumableStock.length, 0);
  assert.deepEqual((await registry.get(f.s)).items, r.items);
});
