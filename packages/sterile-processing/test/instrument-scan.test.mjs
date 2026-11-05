import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  MaintenanceRegistry,
  ProcessingRegistry,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
async function fixture() {
  const repo = new MemoryRepository(),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    r = new InstrumentRegistry(repo);
  const t = await r.createType(s, {
    requestId: randomUUID(),
    code: "CLAMP",
    name: "Clamp",
    manufacturer: "Maker",
    model: "Model",
  });
  const i = await r.register(s, {
    requestId: randomUUID(),
    code: "LEGACY-CODE",
    instrumentTypeId: t.id,
    serialNumber: "MANUFACTURER-SERIAL-123",
  });
  return { repo, s, r, i };
}
const fail = (p, code) => assert.rejects(p, (e) => e.code === code);
test("scan identifiers are stable and separate; existing records resolve without mutation", async () => {
  const f = await fixture(),
    before = structuredClone(f.repo.state),
    i = await f.r.get(f.s, f.i.id);
  assert.equal(i.scanIdentifier, "RSP-I-" + i.id.toUpperCase());
  assert.equal(i.serialNumber, "MANUFACTURER-SERIAL-123");
  const result = await f.r.lookupScan(
    f.s,
    "  " + i.scanIdentifier.toLowerCase() + "\r\n",
  );
  assert.equal(result.id, i.id);
  assert.equal(result.version, 1);
  assert.equal((await f.r.list(f.s)).items[0].scanIdentifier, i.scanIdentifier);
  assert.deepEqual(f.repo.state, before);
});
test("scan lookup fetches current maintenance and processing restrictions, never releases", async () => {
  const f = await fixture(),
    m = new MaintenanceRegistry(f.repo),
    token = (await f.r.get(f.s, f.i.id)).scanIdentifier;
  await m.report(f.s, f.i.id, {
    requestId: randomUUID(),
    version: 1,
    defect: "Damage",
    location: "Quarantine",
    confirmed: true,
  });
  assert.equal((await f.r.lookupScan(f.s, token)).state, "maintenance");
  assert.equal(
    (await f.r.lookupScan(f.s, token)).maintenance[0].defect,
    "Damage",
  );
  assert.equal((await f.r.lookupScan(f.s, token)).version, 2);
  assert.equal(f.repo.state.processing.length, 0);
});
test("unknown and foreign instrument scans do not resolve", async () => {
  const f = await fixture(),
    token = (await f.r.get(f.s, f.i.id)).scanIdentifier;
  await fail(
    f.r.lookupScan({ ...f.s, facilityId: randomUUID() }, token),
    "NOT_FOUND",
  );
  await fail(
    f.r.lookupScan({ ...f.s, tenantId: randomUUID() }, token),
    "NOT_FOUND",
  );
  await fail(f.r.lookupScan(f.s, "RSP-I-" + randomUUID()), "NOT_FOUND");
});
test("lookup rejects partial tokens, URLs, device prefixes and manufacturer data", async () => {
  const f = await fixture(),
    token = (await f.r.get(f.s, f.i.id)).scanIdentifier;
  for (const v of [
    "",
    token.slice(0, -1),
    token + "x",
    "https://example.org/" + token,
    "]d2" + token,
    "MANUFACTURER-SERIAL-123",
    "x".repeat(129),
    {},
    null,
  ])
    await fail(f.r.lookupScan(f.s, v), "INVALID_REQUEST");
  assert.equal(f.repo.state.audit.length, 2);
});
test("lookup includes current processing hold and retired state without performing operations", async () => {
  const f = await fixture(),
    token = (await f.r.get(f.s, f.i.id)).scanIdentifier;
  await new ProcessingRegistry(f.repo).receive(f.s, {
    requestId: randomUUID(),
    code: "REC",
    source: "x",
    custodian: "x",
    condition: "x",
    discrepancies: "",
    instrumentIds: [f.i.id],
    confirmed: true,
  });
  assert.equal(
    (await f.r.lookupScan(f.s, token)).processingHold.episodeCode,
    "REC",
  );
  const g = await fixture();
  await g.r.retire(g.s, g.i.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Retired",
  });
  assert.equal((await g.r.lookupScan(g.s, "RSP-I-" + g.i.id)).state, "retired");
});
