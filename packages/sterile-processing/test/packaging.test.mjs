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
