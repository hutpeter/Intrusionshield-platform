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
const scan = (p, extra = {}) => ({
  requestId: randomUUID(),
  version: 1,
  identifier: `RSP-P-${p.id.toUpperCase()}-V${p.version}`,
  confirmed: true,
  ...extra,
});
test("package identifiers are version-bound, scoped and independent of instrument tokens", async () => {
  const f = await fixture(),
    p = f.packageRecord,
    before = structuredClone(f.repo.state),
    token = (await f.pk.get(f.s, p.id)).scanIdentifier;
  assert.equal(token, `RSP-P-${p.id.toUpperCase()}-V1`);
  assert.equal(
    (await f.pk.lookupScan(f.s, " " + token.toLowerCase() + " ")).id,
    p.id,
  );
  await fail(
    f.pk.lookupScan({ ...f.s, facilityId: randomUUID() }, token),
    "NOT_FOUND",
  );
  await fail(f.pk.lookupScan(f.s, "RSP-I-" + p.id), "INVALID_REQUEST");
  await fail(
    f.pk.lookupScan(f.s, token.replace("-V1", "-V0")),
    "INVALID_REQUEST",
  );
  await fail(f.pk.lookupScan(f.s, token.replace("-V1", "-V2")), "CONFLICT");
  assert.deepEqual(f.repo.state, before);
});
test("confirmed scan reserves one candidate and preserves draft/history/idempotency", async () => {
  const f = await fixture(),
    candidate = await anotherPackage(f),
    l = await f.cy.create(f.s, loadBody(f.packageRecord)),
    b = scan(candidate),
    updated = await f.cy.addByScan(f.s, l.id, b);
  assert.equal(updated.state, "draft");
  assert.equal(updated.packages.length, 2);
  assert.equal(updated.packages.filter((p) => p.id === candidate.id).length, 1);
  assert.equal((await f.pk.get(f.s, candidate.id)).activeLoad.loadId, l.id);
  assert.deepEqual(await f.cy.addByScan(f.s, l.id, b), updated);
  assert.equal((await f.cy.get(f.s, l.id, 1)).packages.length, 1);
  assert.equal(
    f.repo.state.audit.filter((x) => x.action === "load-package-added-by-scan")
      .length,
    1,
  );
});
test("duplicate, stale label/load, malformed token and missing confirmation cannot add", async () => {
  const f = await fixture(),
    candidate = await anotherPackage(f),
    l = await f.cy.create(f.s, loadBody(f.packageRecord));
  await fail(
    f.cy.addByScan(f.s, l.id, scan(f.packageRecord)),
    "SCAN_DUPLICATE",
  );
  await fail(
    f.cy.addByScan(f.s, l.id, scan(candidate, { confirmed: false })),
    "INVALID_REQUEST",
  );
  await fail(
    f.cy.addByScan(
      f.s,
      l.id,
      scan(candidate, { identifier: "https://example.org" }),
    ),
    "INVALID_REQUEST",
  );
  await fail(
    f.cy.addByScan(f.s, l.id, scan(candidate, { version: 2 })),
    "CONFLICT",
  );
  await fail(
    f.cy.addByScan(
      f.s,
      l.id,
      scan(candidate, { identifier: `RSP-P-${candidate.id}-V2` }),
    ),
    "CONFLICT",
  );
  assert.equal((await f.cy.get(f.s, l.id)).packages.length, 1);
});
test("void, recall, return and other-load gates apply to scanned packages", async () => {
  const f = await fixture(),
    candidate = await anotherPackage(f),
    l = await f.cy.create(f.s, loadBody(f.packageRecord));
  const token = scan(candidate);
  await f.pk.void(f.s, candidate.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Damaged",
    confirmed: true,
  });
  await fail(f.cy.addByScan(f.s, l.id, token), "CONFLICT");
  await fail(
    f.cy.addByScan(f.s, l.id, scan({ ...candidate, version: 2 })),
    "LOAD_BLOCKED",
  );
  const other = await anotherPackage(f),
    otherLoad = await f.cy.create(f.s, loadBody(other, { code: "OTHER" }));
  await fail(f.cy.addByScan(f.s, l.id, scan(other)), "LOAD_BLOCKED");
  const free = await anotherPackage(f);
  for (const [method, error] of [
    ["findRecallBlock", "RECALL_BLOCKED"],
    ["findReturnByPackage", "RETURN_BLOCKED"],
  ]) {
    const repo = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            [method]: async (id) =>
              id === free.id ? { id: randomUUID() } : null,
          }),
        ),
    };
    await fail(new CycleRegistry(repo).addByScan(f.s, l.id, scan(free)), error);
  }
});
test("running loads, foreign scope, races and audit failures cannot partially claim a package", async () => {
  const f = await fixture(),
    candidate = await anotherPackage(f),
    l = await f.cy.create(f.s, loadBody(f.packageRecord));
  await fail(
    f.cy.addByScan({ ...f.s, facilityId: randomUUID() }, l.id, scan(candidate)),
    "NOT_FOUND",
  );
  const before = structuredClone(f.repo.state);
  f.repo.failAudit = true;
  await assert.rejects(f.cy.addByScan(f.s, l.id, scan(candidate)));
  assert.deepEqual(f.repo.state, before);
  f.repo.failAudit = false;
  const seed = await anotherPackage(f),
    l2 = await f.cy.create(f.s, loadBody(seed, { code: "SECOND" }));
  const results = await Promise.allSettled([
    f.cy.addByScan(f.s, l.id, scan(candidate)),
    f.cy.addByScan(f.s, l2.id, scan(candidate)),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const current = await f.cy.get(f.s, l.id);
  await f.cy.start(f.s, l.id, cycleStart(current.version));
  const extra = await anotherPackage(f);
  await fail(
    f.cy.addByScan(f.s, l.id, scan(extra, { version: current.version + 1 })),
    "CONFLICT",
  );
});
