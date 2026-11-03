import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { InstrumentRegistry, TrayRegistry } from "../dist/index.js";
import { MemoryRepository } from "./memory-repository.mjs";
async function fixture() {
  const repository = new MemoryRepository(),
    instruments = new InstrumentRegistry(repository),
    trays = new TrayRegistry(repository),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    };
  const type = await instruments.createType(s, {
    requestId: randomUUID(),
    code: "CLAMP",
    name: "Pinza",
    manufacturer: "",
    model: "",
  });
  const i = await instruments.register(s, {
    requestId: randomUUID(),
    instrumentTypeId: type.id,
    code: "INS-1",
    serialNumber: "S1",
  });
  const definition = await trays.createDefinition(s, {
    requestId: randomUUID(),
    code: "TRAY-1",
    name: "Bandeja básica",
    requirements: [{ instrumentTypeId: type.id, quantity: 1 }],
  });
  const create = (code) =>
    trays.createAssembly(s, {
      requestId: randomUUID(),
      code,
      definitionId: definition.id,
      definitionVersion: definition.version,
    });
  const assembly = await create("ASM-1");
  return {
    repository,
    instruments,
    trays,
    s,
    type,
    i,
    definition,
    assembly,
    create,
  };
}
const command = (a, extra = {}) => ({
  requestId: randomUUID(),
  version: a.version,
  ...extra,
});
const transition = (a, action, reason = "") =>
  command(a, { action, confirmed: true, reason });
test("creates versioned composition and a draft with a frozen definition, without claiming clinical release", async () => {
  const f = await fixture(),
    v = await f.trays.assembly(f.s, f.assembly.id);
  assert.equal(v.assembly.state, "draft");
  assert.equal(v.assessment.missing, 1);
  assert.equal(v.assessment.complete, false);
  assert.equal(
    v.assembly.definitionSnapshot.requirements[0].instrumentTypeName,
    "Pinza",
  );
  assert.equal(Object.hasOwn(v.assembly, "sterile"), false);
});
test("definition revisions retain earlier requirements and do not mutate existing assemblies", async () => {
  const f = await fixture();
  const revised = await f.trays.reviseDefinition(f.s, f.definition.id, {
    requestId: randomUUID(),
    version: 1,
    name: "Bandeja ampliada",
    reason: "Needs two clamps",
    requirements: [{ instrumentTypeId: f.type.id, quantity: 2 }],
  });
  assert.equal(revised.revision, 2);
  assert.equal(
    (await f.trays.definition(f.s, f.definition.id, 1)).requirements[0]
      .quantity,
    1,
  );
  assert.equal(
    (await f.trays.assembly(f.s, f.assembly.id)).assembly.definitionSnapshot
      .name,
    "Bandeja básica",
  );
  const newer = await f.trays.createAssembly(f.s, {
    requestId: randomUUID(),
    code: "ASM-NEW",
    definitionId: revised.id,
    definitionVersion: revised.version,
  });
  assert.equal(newer.definitionRevision, 2);
  assert.equal(newer.definitionSnapshot.requirements[0].quantity, 2);
  await assert.rejects(f.create("STALE"), { code: "CONFLICT" });
});
test("blocks incomplete completion and exact-count mismatches including unexpected types", async () => {
  const f = await fixture();
  await assert.rejects(
    f.trays.transition(f.s, f.assembly.id, transition(f.assembly, "complete")),
    { code: "ASSEMBLY_INCOMPLETE" },
  );
  const t2 = await f.instruments.createType(f.s, {
    requestId: randomUUID(),
    code: "SCISSORS",
    name: "Tijera",
    manufacturer: "",
    model: "",
  });
  const other = await f.instruments.register(f.s, {
    requestId: randomUUID(),
    instrumentTypeId: t2.id,
    code: "INS-2",
    serialNumber: "",
  });
  const a = await f.trays.updateContents(
    f.s,
    f.assembly.id,
    command(f.assembly, { instrumentIds: [other.id] }),
  );
  const v = await f.trays.assembly(f.s, a.id);
  assert.equal(v.assessment.required, v.assessment.assigned);
  assert.equal(v.assessment.missing, 1);
  assert.equal(v.assessment.excess, 1);
  await assert.rejects(
    f.trays.transition(f.s, a.id, transition(a, "complete")),
    { code: "ASSEMBLY_INCOMPLETE" },
  );
});
test("reserves instruments in drafts, prevents retirement/double assignment and releases only through explicit disassembly", async () => {
  const f = await fixture(),
    other = await f.create("ASM-2");
  let a = await f.trays.updateContents(
    f.s,
    f.assembly.id,
    command(f.assembly, { instrumentIds: [f.i.id] }),
  );
  await assert.rejects(
    f.trays.updateContents(
      f.s,
      other.id,
      command(other, { instrumentIds: [f.i.id] }),
    ),
    { code: "INSTRUMENT_ASSIGNED" },
  );
  await assert.rejects(
    f.instruments.retire(f.s, f.i.id, {
      requestId: randomUUID(),
      version: 1,
      reason: "Must not retire assigned instrument",
    }),
    { code: "INSTRUMENT_ASSIGNED" },
  );
  assert.equal(
    (await f.instruments.get(f.s, f.i.id)).activeAssembly.assemblyId,
    a.id,
  );
  a = await f.trays.transition(f.s, a.id, transition(a, "complete"));
  const completed = structuredClone(a);
  await assert.rejects(
    f.trays.updateContents(f.s, a.id, command(a, { instrumentIds: [] })),
    { code: "CONFLICT" },
  );
  a = await f.trays.transition(
    f.s,
    a.id,
    transition(a, "disassemble", "Reprocessing preparation"),
  );
  assert.equal(a.instruments[0].id, f.i.id);
  assert.equal(a.completedAt, completed.completedAt);
  assert.equal(
    (await f.trays.assembly(f.s, a.id, completed.version)).assembly.state,
    "complete",
  );
  assert.equal(
    (await f.instruments.get(f.s, f.i.id)).activeAssembly,
    undefined,
  );
  await f.trays.updateContents(
    f.s,
    other.id,
    command(other, { instrumentIds: [f.i.id] }),
  );
  assert.equal(
    (await f.instruments.get(f.s, f.i.id)).activeAssembly.assemblyId,
    other.id,
  );
});
test("saving edited draft contents releases removed instruments and keeps earlier contents readable", async () => {
  const f = await fixture();
  const a = await f.trays.updateContents(
    f.s,
    f.assembly.id,
    command(f.assembly, { instrumentIds: [f.i.id] }),
  );
  const empty = await f.trays.updateContents(
    f.s,
    a.id,
    command(a, { instrumentIds: [] }),
  );
  assert.equal(empty.instruments.length, 0);
  assert.equal(
    (await f.trays.assembly(f.s, a.id, a.version)).assembly.instruments[0].code,
    "INS-1",
  );
  assert.equal(
    (await f.instruments.get(f.s, f.i.id)).activeAssembly,
    undefined,
  );
});
test("rejects duplicate IDs, retired instruments, invalid quantities, foreign type IDs and unconfirmed actions", async () => {
  const f = await fixture();
  await assert.rejects(
    f.trays.updateContents(
      f.s,
      f.assembly.id,
      command(f.assembly, { instrumentIds: [f.i.id, f.i.id.toUpperCase()] }),
    ),
    { code: "INVALID_REQUEST" },
  );
  await f.instruments.retire(f.s, f.i.id, {
    requestId: randomUUID(),
    version: 1,
    reason: "Damaged",
  });
  await assert.rejects(
    f.trays.updateContents(
      f.s,
      f.assembly.id,
      command(f.assembly, { instrumentIds: [f.i.id] }),
    ),
    { code: "INSTRUMENT_ASSIGNED" },
  );
  for (const requirements of [
    [],
    [{ instrumentTypeId: f.type.id, quantity: 0 }],
    [{ instrumentTypeId: f.type.id, quantity: 1.5 }],
    [{ instrumentTypeId: f.type.id, quantity: 501 }],
    [
      { instrumentTypeId: f.type.id, quantity: 1 },
      { instrumentTypeId: f.type.id, quantity: 1 },
    ],
    [{ instrumentTypeId: f.type.id, quantity: 1, tenantId: f.s.tenantId }],
  ])
    await assert.rejects(
      f.trays.createDefinition(f.s, {
        requestId: randomUUID(),
        code: "INVALID",
        name: "Invalid",
        requirements,
      }),
      { code: "INVALID_REQUEST" },
    );
  await assert.rejects(
    f.trays.createDefinition(f.s, {
      requestId: randomUUID(),
      code: "FOREIGN",
      name: "Foreign",
      requirements: [{ instrumentTypeId: randomUUID(), quantity: 1 }],
    }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(
    f.trays.transition(f.s, f.assembly.id, {
      ...transition(f.assembly, "disassemble", "Test"),
      confirmed: false,
    }),
    { code: "INVALID_REQUEST" },
  );
  await assert.rejects(
    f.trays.transition(
      f.s,
      f.assembly.id,
      transition(f.assembly, "disassemble", " "),
    ),
    { code: "INVALID_REQUEST" },
  );
});
test("uses idempotent writes and rejects stale versions or changed requests", async () => {
  const f = await fixture(),
    input = command(f.assembly, { instrumentIds: [f.i.id] });
  const a = await f.trays.updateContents(f.s, f.assembly.id, input);
  assert.deepEqual(await f.trays.updateContents(f.s, f.assembly.id, input), a);
  await assert.rejects(
    f.trays.updateContents(f.s, a.id, { ...input, instrumentIds: [] }),
    { code: "CONFLICT" },
  );
  await assert.rejects(
    f.trays.updateContents(f.s, a.id, { ...input, requestId: randomUUID() }),
    { code: "CONFLICT" },
  );
  const close = transition(a, "disassemble", "Done");
  const closed = await f.trays.transition(f.s, a.id, close);
  assert.deepEqual(await f.trays.transition(f.s, a.id, close), closed);
  await assert.rejects(
    f.trays.transition(f.s, a.id, {
      ...close,
      requestId: randomUUID(),
      version: closed.version,
    }),
    { code: "CONFLICT" },
  );
});
test("denies foreign tenant/facility reads, writes, revisions and historical content", async () => {
  const f = await fixture();
  for (const s of [
    { ...f.s, tenantId: randomUUID() },
    { ...f.s, facilityId: randomUUID() },
  ]) {
    assert.equal((await f.trays.definitions(s)).items.length, 0);
    assert.equal((await f.trays.assemblies(s)).items.length, 0);
    await assert.rejects(f.trays.definition(s, f.definition.id, 1), {
      code: "NOT_FOUND",
    });
    await assert.rejects(f.trays.assembly(s, f.assembly.id, 1), {
      code: "NOT_FOUND",
    });
    await assert.rejects(f.trays.history(s, f.assembly.id, "assembly"), {
      code: "NOT_FOUND",
    });
    await assert.rejects(
      f.trays.updateContents(
        s,
        f.assembly.id,
        command(f.assembly, { instrumentIds: [f.i.id] }),
      ),
      { code: "NOT_FOUND" },
    );
  }
});
test("accepts exactly one concurrent claimant and keeps the losing assembly unchanged", async () => {
  const f = await fixture(),
    other = await f.create("ASM-2");
  const results = await Promise.allSettled([
    f.trays.updateContents(
      f.s,
      f.assembly.id,
      command(f.assembly, { instrumentIds: [f.i.id] }),
    ),
    f.trays.updateContents(
      f.s,
      other.id,
      command(other, { instrumentIds: [f.i.id] }),
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "INSTRUMENT_ASSIGNED",
  );
  assert.equal(f.repository.state.assignments.length, 1);
  assert.equal(
    f.repository.state.assemblies.filter((a) => a.instruments.length === 0)
      .length,
    1,
  );
});
test("audit failures roll back revisions, membership, historical snapshots and retry receipts", async () => {
  const f = await fixture(),
    before = structuredClone(f.repository.state),
    input = command(f.assembly, { instrumentIds: [f.i.id] });
  f.repository.failAudit = true;
  await assert.rejects(
    f.trays.updateContents(f.s, f.assembly.id, input),
    /synthetic audit/,
  );
  assert.deepEqual(f.repository.state, before);
  await assert.rejects(
    f.trays.reviseDefinition(f.s, f.definition.id, {
      requestId: randomUUID(),
      version: 1,
      name: "Changed",
      reason: "Test",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 2 }],
    }),
  );
  assert.deepEqual(f.repository.state, before);
  f.repository.failAudit = false;
  const a = await f.trays.updateContents(f.s, f.assembly.id, input);
  const state = structuredClone(f.repository.state);
  f.repository.failAudit = true;
  await assert.rejects(
    f.trays.transition(f.s, a.id, transition(a, "disassemble", "Test")),
  );
  assert.deepEqual(f.repository.state, state);
});
test("blocks completion when assigned instrument evidence changed until an explicit draft refresh", async () => {
  const f = await fixture();
  const a = await f.trays.updateContents(
    f.s,
    f.assembly.id,
    command(f.assembly, { instrumentIds: [f.i.id] }),
  );
  f.repository.state.instruments[0].version++;
  await assert.rejects(
    f.trays.transition(f.s, a.id, transition(a, "complete")),
    { code: "CONFLICT" },
  );
  const refreshed = await f.trays.updateContents(
    f.s,
    a.id,
    command(a, { instrumentIds: [f.i.id] }),
  );
  assert.equal(
    (await f.trays.transition(f.s, a.id, transition(refreshed, "complete")))
      .state,
    "complete",
  );
});
