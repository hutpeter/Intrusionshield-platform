import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  prepareBootstrap,
  writeBootstrap,
} from "./account-admin-bootstrap.mjs";
const input = () => ({
  tenantId: randomUUID(),
  username: "platform.owner",
  email: "owner@example.invalid",
  displayName: "Owner's name",
  origin: "http://localhost:5173",
});
test("trusted bootstrap prepares one pending superuser with hashed one-use setup token and guards existing roots, client and duplicates", () => {
  const b = prepareBootstrap(input()),
    token = b.link.trim().split("=")[1];
  assert.equal(token.length, 43);
  assert.equal(b.sql.includes(token), false);
  assert.ok(b.sql.includes(createHash("sha256").update(token).digest("hex")));
  assert.ok(b.sql.includes("Bootstrap refused"));
  assert.ok(b.sql.includes("N'PENDING'"));
  assert.ok(b.sql.includes("ROLLBACK"));
  assert.ok(b.sql.includes("Owner''s name"));
  assert.equal(
    /PasswordHash|CREATE LOGIN|ALTER TABLE|DELETE FROM/i.test(b.sql),
    false,
  );
  assert.ok(b.sql.includes("p.Resource=N'platform.users'"));
});
test("bootstrap refuses remote HTTP, unexpected fields, invalid identities and unsafe profile values", () => {
  for (const patch of [
    { origin: "http://example.com" },
    { tenantId: "x';DROP TABLE x" },
    { username: "not a login" },
    { email: "bad" },
    { displayName: "" },
    { extra: true },
  ])
    assert.throws(() => prepareBootstrap({ ...input(), ...patch }));
  assert.ok(
    prepareBootstrap({
      ...input(),
      origin: "https://accounts.example.invalid",
    }).link.startsWith("https:"),
  );
});
test("bootstrap output stays private and is never overwritten", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "ruby-admin-bootstrap-"));
  chmodSync(dir, 0o700);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const b = prepareBootstrap(input());
  writeBootstrap(dir, b);
  assert.equal(
    readFileSync(join(dir, "account-admin-bootstrap.sql"), "utf8"),
    b.sql,
  );
  assert.throws(() => writeBootstrap(dir, b), /already exist/);
  assert.equal(
    readFileSync(join(dir, "account-admin-setup-link.txt"), "utf8"),
    b.link,
  );
});

test("initial platform tenant registration is opt-in and never overwrites an existing client configuration", () => {
  const plain = prepareBootstrap(input());
  assert.equal(plain.sql.includes("INSERT INTO [Platform].[Tenants]"), false);
  const initialized = prepareBootstrap({ ...input(), initializeTenant: true });
  assert.ok(initialized.sql.includes("INSERT INTO [Platform].[Tenants]"));
  assert.ok(
    initialized.sql.includes(
      "IF NOT EXISTS(SELECT 1 FROM EIS.TenantConfigurations",
    ),
  );
  assert.equal(/UPDATE .*TenantConfigurations/.test(initialized.sql), false);
  assert.ok(initialized.sql.includes("Action IN(N'READ',N'CREATE')"));
  assert.throws(() =>
    prepareBootstrap({ ...input(), initializeTenant: "yes" }),
  );
});
