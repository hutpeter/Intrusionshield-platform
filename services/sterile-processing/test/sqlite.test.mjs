import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, chmodSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { InstrumentRegistry } from "@intrusionshield/sterile-processing";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ruby-sterile-")),
    file = join(dir, "registry.sqlite");
  const repository = new PreviewSqliteRepository(file);
  const scope = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    registry = new InstrumentRegistry(repository);
  let closed = false;
  t.after(() => {
    if (!closed) repository.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    repository,
    registry,
    scope,
    file,
    dir,
    close() {
      repository.close();
      closed = true;
    },
  };
}
const createType = (registry, s, code = "CLAMP") =>
  registry.createType(s, {
    requestId: randomUUID(),
    code,
    name: "Pinza quirúrgica",
    manufacturer: "Prueba",
    model: "",
  });
const registration = (type) => ({
  requestId: randomUUID(),
  instrumentTypeId: type.id,
  code: "INS-01",
  serialNumber: "DEMO",
});
test("persists instrument types, retirement, audit and replay receipts across reopening", async (t) => {
  const f = fixture(t),
    type = await createType(f.registry, f.scope),
    command = registration(type);
  const i = await f.registry.register(f.scope, command);
  const retirement = {
    requestId: randomUUID(),
    version: i.version,
    reason: "Daño de prueba",
  };
  await f.registry.retire(f.scope, i.id, retirement);
  f.close();
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const registry = new InstrumentRegistry(reopened);
    assert.equal((await registry.get(f.scope, i.id)).state, "retired");
    assert.deepEqual(await registry.register(f.scope, command), i);
    const h = await registry.history(f.scope, i.id);
    assert.deepEqual(
      h.items.map((e) => e.action),
      ["instrument-retired", "instrument-registered"],
    );
    assert.equal(h.items[0].reason, retirement.reason);
    assert.equal(h.items[0].actorId, f.scope.actorId);
  } finally {
    reopened.close();
  }
});
test("enforces tenant/facility ownership and scoped history on actual local storage", async (t) => {
  const f = fixture(t),
    type = await createType(f.registry, f.scope),
    i = await f.registry.register(f.scope, registration(type));
  for (const scope of [
    { ...f.scope, tenantId: randomUUID() },
    { ...f.scope, facilityId: randomUUID() },
  ]) {
    assert.equal((await f.registry.list(scope)).items.length, 0);
    assert.equal((await f.registry.listTypes(scope)).items.length, 0);
    await assert.rejects(f.registry.history(scope, i.id), {
      code: "NOT_FOUND",
    });
    await assert.rejects(f.registry.register(scope, registration(type)), {
      code: "NOT_FOUND",
    });
  }
});
test("serializes concurrent registrations and rolls back state/receipts when audit fails", async (t) => {
  const f = fixture(t),
    type = await createType(f.registry, f.scope);
  const results = await Promise.allSettled([
    f.registry.register(f.scope, registration(type)),
    f.registry.register(f.scope, registration(type)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    results.find((r) => r.status === "rejected").reason.code,
    "CONFLICT",
  );
  const db = new DatabaseSync(f.file);
  try {
    db.exec(
      "CREATE TRIGGER reject_audit BEFORE INSERT ON sp_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
    );
    const command = { ...registration(type), code: "ROLLBACK" };
    await assert.rejects(
      f.registry.register(f.scope, command),
      /synthetic audit/,
    );
    assert.equal((await f.registry.list(f.scope)).items.length, 1);
    db.exec("DROP TRIGGER reject_audit");
    await f.registry.register(f.scope, command);
    assert.equal((await f.registry.list(f.scope)).items.length, 2);
    const i = (await f.registry.list(f.scope)).items[0];
    const command2 = {
      requestId: randomUUID(),
      version: i.version,
      reason: "Test",
    };
    db.exec(
      "CREATE TRIGGER reject_audit BEFORE INSERT ON sp_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
    );
    await assert.rejects(f.registry.retire(f.scope, i.id, command2));
    assert.equal((await f.registry.get(f.scope, i.id)).state, "registered");
    db.exec("DROP TRIGGER reject_audit");
    await f.registry.retire(f.scope, i.id, command2);
    assert.equal((await f.registry.get(f.scope, i.id)).state, "retired");
  } finally {
    db.close();
  }
});
test("keeps deterministic pagination and rejects stale retirement across separate connections", async (t) => {
  const f = fixture(t),
    type = await createType(f.registry, f.scope);
  for (let n = 0; n < 52; n++)
    await f.registry.register(f.scope, {
      ...registration(type),
      code: "INS-" + n,
    });
  const a = await f.registry.list(f.scope, 1),
    b = await f.registry.list(f.scope, 2);
  assert.equal(a.items.length, 50);
  assert.equal(a.hasMore, true);
  assert.equal(b.items.length, 2);
  assert.equal(new Set([...a.items, ...b.items].map((i) => i.id)).size, 52);
  const second = new PreviewSqliteRepository(f.file);
  try {
    const r = new InstrumentRegistry(second),
      i = a.items[0];
    await r.retire(f.scope, i.id, {
      requestId: randomUUID(),
      version: i.version,
      reason: "Other connection",
    });
    await assert.rejects(
      f.registry.retire(f.scope, i.id, {
        requestId: randomUUID(),
        version: i.version,
        reason: "Stale view",
      }),
      { code: "CONFLICT" },
    );
  } finally {
    second.close();
  }
});
test("requires explicit development opt-in and rejects symlinks or public local storage", async (t) => {
  const f = fixture(t);
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () => new PreviewSqliteRepository(join(f.dir, "production.sqlite")),
      /explicit development/,
    );
  } finally {
    process.env.NODE_ENV = original;
  }
  if (process.platform !== "win32") {
    const link = join(f.dir, "link.sqlite");
    symlinkSync(f.file, link);
    assert.throws(
      () => new PreviewSqliteRepository(link),
      /private regular file/,
    );
    chmodSync(f.file, 0o644);
    assert.throws(
      () => new PreviewSqliteRepository(f.file),
      /private regular file/,
    );
    chmodSync(f.file, 0o600);
  }
});
