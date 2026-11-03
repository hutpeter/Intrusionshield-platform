import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  InstrumentRegistry,
  sterileCatalogues,
  sterileMessages,
} from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
const scope = () => ({
  tenantId: randomUUID(),
  facilityId: randomUUID(),
  actorId: randomUUID(),
});
async function fixture() {
  const repository = new MemoryRepository(),
    registry = new InstrumentRegistry(repository),
    s = scope();
  const type = await registry.createType(s, {
    requestId: randomUUID(),
    code: "CLAMP",
    name: "Pinza quirúrgica",
    manufacturer: "",
    model: "",
  });
  return { repository, registry, s, type };
}
const input = (type) => ({
  requestId: randomUUID(),
  instrumentTypeId: type.id,
  code: "INS-001",
  serialNumber: "",
});
test("registers an instrument without claiming clinical availability, and preserves tenant/facility audit", async () => {
  const { repository, registry, s, type } = await fixture();
  const i = await registry.register(s, input(type));
  assert.equal(i.state, "registered");
  assert.equal(i.ownerFacilityId, s.facilityId);
  assert.equal(i.instrumentTypeId, type.id);
  assert.equal(Object.hasOwn(i, "sterile"), false);
  assert.deepEqual(
    repository.state.audit.map((e) => e.action),
    ["type-created", "instrument-registered"],
  );
  assert.equal(repository.state.audit[1].actorId, s.actorId);
});
test("idempotent retries return the original outcome and reject changed command data", async () => {
  const { repository, registry, s, type } = await fixture(),
    body = input(type);
  const one = await registry.register(s, body);
  assert.deepEqual(await registry.register(s, body), one);
  assert.equal(repository.state.instruments.length, 1);
  await assert.rejects(registry.register(s, { ...body, code: "ANOTHER" }), {
    code: "CONFLICT",
  });
  assert.equal(repository.state.audit.length, 2);
});
test("isolates tenant and facility reads, catalogue references, retirement and retry identities", async () => {
  const { registry, s, type } = await fixture(),
    i = await registry.register(s, input(type));
  for (const foreign of [
    { ...s, tenantId: randomUUID() },
    { ...s, facilityId: randomUUID() },
  ]) {
    assert.deepEqual((await registry.list(foreign)).items, []);
    assert.deepEqual((await registry.listTypes(foreign)).items, []);
    await assert.rejects(registry.get(foreign, i.id), { code: "NOT_FOUND" });
    await assert.rejects(registry.register(foreign, input(type)), {
      code: "NOT_FOUND",
    });
    await assert.rejects(
      registry.retire(foreign, i.id, {
        requestId: randomUUID(),
        version: 1,
        reason: "Other scope",
      }),
      { code: "NOT_FOUND" },
    );
  }
});
test("normalizes codes and rejects duplicate registration, including racing transactions", async () => {
  const { registry, s, type, repository } = await fixture();
  const results = await Promise.allSettled([
    registry.register(s, { ...input(type), code: "ins-001" }),
    registry.register(s, input(type)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "CONFLICT",
  );
  assert.equal(repository.state.instruments.length, 1);
  await assert.rejects(
    registry.createType(s, {
      requestId: randomUUID(),
      code: "clamp",
      name: "Duplicate",
      manufacturer: "",
      model: "",
    }),
    { code: "CONFLICT" },
  );
});
test("retires with an audit reason, rejects stale or repeated transitions and retains the original instrument", async () => {
  const { registry, s, type, repository } = await fixture(),
    i = await registry.register(s, input(type));
  const command = {
    requestId: randomUUID(),
    version: 1,
    reason: "Damaged beyond repair",
  };
  const retired = await registry.retire(s, i.id, command);
  assert.equal(retired.version, 2);
  assert.equal(retired.state, "retired");
  assert.equal(retired.createdAt, i.createdAt);
  assert.equal(retired.retirementReason, command.reason);
  assert.deepEqual(await registry.retire(s, i.id, command), retired);
  assert.equal(repository.state.audit.length, 3);
  await assert.rejects(
    registry.retire(s, i.id, { ...command, requestId: randomUUID() }),
    { code: "CONFLICT" },
  );
  assert.equal((await registry.list(s)).items.length, 1);
});
test("rolls back state and retry receipts when audit persistence fails", async () => {
  const { registry, s, type, repository } = await fixture(),
    body = input(type);
  repository.failAudit = true;
  await assert.rejects(registry.register(s, body), /synthetic audit/);
  assert.equal(repository.state.instruments.length, 0);
  assert.equal(repository.state.receipts.length, 1);
  repository.failAudit = false;
  const i = await registry.register(s, body);
  repository.failAudit = true;
  await assert.rejects(
    registry.retire(s, i.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Test",
    }),
  );
  assert.equal((await registry.get(s, i.id)).state, "registered");
});
test("rejects invalid identifiers, controls, excessive data and missing retirement reason", async () => {
  const { registry, s, type } = await fixture();
  for (const code of ["", "<script>", "x".repeat(101)])
    await assert.rejects(registry.register(s, { ...input(type), code }), {
      code: "INVALID_REQUEST",
    });
  await assert.rejects(
    registry.createType(s, {
      requestId: randomUUID(),
      code: "NEW",
      name: "bad\u0000name",
      manufacturer: "",
      model: "",
    }),
    { code: "INVALID_REQUEST" },
  );
  await assert.rejects(
    registry.register({ ...s, actorId: "spoofed" }, input(type)),
    { code: "INVALID_REQUEST" },
  );
  const i = await registry.register(s, input(type));
  for (const version of [0, 1.5, NaN])
    await assert.rejects(
      registry.retire(s, i.id, {
        requestId: randomUUID(),
        version,
        reason: "Test",
      }),
      { code: "INVALID_REQUEST" },
    );
  await assert.rejects(
    registry.retire(s, i.id, {
      requestId: randomUUID(),
      version: 1,
      reason: " ",
    }),
    { code: "INVALID_REQUEST" },
  );
});
test("bounds pagination and never mutates stored records through returned objects", async () => {
  const { registry, s, type } = await fixture();
  for (let n = 0; n < 52; n++)
    await registry.register(s, { ...input(type), code: "INS-" + n });
  const a = await registry.list(s, 1),
    b = await registry.list(s, 2);
  assert.equal(a.items.length, 50);
  assert.equal(a.hasMore, true);
  assert.equal(b.items.length, 2);
  assert.equal(b.hasMore, false);
  assert.equal(new Set([...a.items, ...b.items].map((i) => i.id)).size, 52);
  const first = a.items[0];
  first.code = "MUTATED";
  assert.notEqual((await registry.get(s, first.id)).code, "MUTATED");
  for (const page of [0, -1, 1.5, 10001])
    await assert.rejects(registry.list(s, page), { code: "INVALID_REQUEST" });
});
test("supplies complete Spanish, English and French catalogues with Spanish fallback", () => {
  const keys = Object.keys(sterileCatalogues.es).sort();
  for (const catalogue of Object.values(sterileCatalogues)) {
    assert.deepEqual(Object.keys(catalogue).sort(), keys);
    assert.ok(Object.values(catalogue).every((v) => v.trim()));
  }
  assert.equal(sterileMessages("es-PE").name, "Nombre");
  assert.equal(sterileMessages("fr-CA").name, "Nom");
  assert.equal(sterileMessages("en-US").name, "Name");
  assert.equal(sterileMessages("xx").name, "Nombre");
});
