import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  chmodSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  prepareSqlCheck,
  writeSqlCheck,
} from "./account-admin-prepare-sql-check.mjs";
function directory(t) {
  const d = mkdtempSync(join(tmpdir(), "ruby-sql-check-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
test("prepares a random credential and a single-database guarded login, never a server role or production migration", (t) => {
  const d = directory(t),
    f = prepareSqlCheck("Ruby_AccountAdmin_Test_20261116", d),
    c = JSON.parse(f["account-admin-sql-check.json"]),
    sql = f["account-admin-sql-check-login.sql"];
  assert.equal(c.database, "Ruby_AccountAdmin_Test_20261116");
  assert.equal(c.server, "localhost");
  assert.match(c.user, /^ruby_admin_check_[a-f0-9]{16}$/);
  assert.equal(c.passwordFile, join(d, "account-admin-sql-check-password.txt"));
  assert.match(sql, /USE \[Ruby_AccountAdmin_Test_20261116\]/);
  assert.match(sql, /sys.tables/);
  assert.match(sql, /SUSER_ID/);
  assert.match(sql, /ALTER ROLE \[db_owner\]/);
  assert.doesNotMatch(
    sql,
    /ALTER SERVER ROLE|DROP DATABASE|CREATE DATABASE|intrusionshield|TRUSTWORTHY|CHECK_POLICY=OFF/i,
  );
  const password = f["account-admin-sql-check-password.txt"].trim();
  assert.equal(password.length, 46);
  assert.ok(sql.includes(password));
  assert.equal(f["account-admin-sql-check.json"].includes(password), false);
  assert.notEqual(
    password,
    prepareSqlCheck(c.database, d)[
      "account-admin-sql-check-password.txt"
    ].trim(),
  );
});
test("rejects real databases, injection, relative and permissive directories", (t) => {
  const d = directory(t);
  for (const db of [
    "intrusionshield",
    "master",
    "Ruby_AccountAdmin_Test_x];DROP DATABASE x--",
    "Ruby_AccountAdmin_Test_",
  ])
    assert.throws(() => prepareSqlCheck(db, d));
  assert.throws(() => prepareSqlCheck("Ruby_AccountAdmin_Test_x", "relative"));
  if (process.platform !== "win32") {
    chmodSync(d, 0o755);
    assert.throws(() => prepareSqlCheck("Ruby_AccountAdmin_Test_x", d));
  }
});
test("writes private files exclusively and preserves an existing bundle", (t) => {
  const d = directory(t),
    f = prepareSqlCheck("Ruby_AccountAdmin_Test_x", d);
  writeSqlCheck(d, f);
  assert.equal(
    readFileSync(join(d, "account-admin-sql-check-login.sql"), "utf8"),
    f["account-admin-sql-check-login.sql"],
  );
  assert.throws(
    () => writeSqlCheck(d, prepareSqlCheck("Ruby_AccountAdmin_Test_x", d)),
    /already exist/,
  );
  assert.equal(
    readFileSync(join(d, "account-admin-sql-check-password.txt"), "utf8"),
    f["account-admin-sql-check-password.txt"],
  );
  assert.throws(() => writeSqlCheck(d, { "../../outside": "x" }));
});
test("refuses linked private directories", (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX symlink fixture");
    return;
  }
  const d = directory(t),
    link = d + "-link";
  t.after(() => rmSync(link, { force: true }));
  symlinkSync(d, link, "dir");
  assert.throws(() => prepareSqlCheck("Ruby_AccountAdmin_Test_x", link));
});
