import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareRuntime,
  writeRuntime,
  runtimeEnvironment,
} from "./athena-account-runtime.mjs";
function fixture(t) {
  const d = mkdtempSync(join(tmpdir(), "athena-local-runtime-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const cert = join(d, "sql-ca.pem");
  writeFileSync(
    cert,
    "-----BEGIN CERTIFICATE-----\npublic-test-fixture\n-----END CERTIFICATE-----\n",
  );
  return { d, cert };
}
test("runtime preparation selects explicit object grants, preserves root assignment protection and gives no database/server role", (t) => {
  const { d, cert } = fixture(t),
    bundle = prepareRuntime("intrusionshield", d, cert),
    sql = bundle["athena-account-login.sql"],
    config = JSON.parse(bundle["athena-account-runtime.json"]);
  assert.match(config.user, /^ruby_athena_accounts_[a-f0-9]{16}$/);
  assert.equal(config.database, "intrusionshield");
  assert.match(sql, /GRANT INSERT ON OBJECT::\[Identity\].\[Users\]/);
  assert.match(sql, /GRANT DELETE ON OBJECT::\[Identity\].\[IdentityRoles\]/);
  assert.match(sql, /GRANT UPDATE \(\[Status\],\[UpdatedAt\]\)/);
  assert.match(sql, /CanControlDatabase/);
  assert.match(sql, /CanAssignSuperusers/);
  assert.doesNotMatch(
    sql,
    /GRANT (?:INSERT|UPDATE|DELETE).*OBJECT::\[Identity\].\[PlatformRoleAssignments\]/,
  );
  assert.doesNotMatch(
    sql,
    /ALTER ROLE|ALTER SERVER ROLE|GRANT CONTROL|GRANT ALTER|CREATE TABLE|UPDATE \[Identity\]|INSERT INTO \[Identity\]/,
  );
  assert.match(sql, /IF OBJECT_ID/);
  assert.match(sql, /IF SUSER_ID/);
  const password = bundle["athena-account-password.txt"].trim(),
    token = bundle["athena-account-token.txt"].trim();
  assert.equal(password.length, 46);
  assert.equal(token.length, 64);
  assert.ok(sql.includes(password));
  assert.equal(sql.includes(token), false);
  assert.equal(JSON.stringify(config).includes(password), false);
  assert.equal(JSON.stringify(config).includes(token), false);
});
test("starter isolates configuration and secrets from inherited DB/auth overrides and binds local HTTP only", (t) => {
  const { d, cert } = fixture(t),
    bundle = prepareRuntime("intrusionshield", d, cert);
  writeRuntime(d, bundle);
  const env = runtimeEnvironment(join(d, "athena-account-runtime.json"), {
    PATH: "local-path",
    DB_DATABASE: "wrong-db",
    DB_TRUST_CERT: "true",
    RUBY_PLATFORM_DB_PASSWORD: "wrong-secret",
    AUTH_TRUST_LOOPBACK_PROXY: "true",
    NODE_OPTIONS: "--import wrong",
    DB_SCHEMA: "wrong-schema",
  });
  assert.equal(env.DB_DATABASE, "intrusionshield");
  assert.equal(env.DB_ENCRYPT, "true");
  assert.equal(env.DB_TRUST_SERVER_CERTIFICATE, "false");
  assert.equal(env.NODE_EXTRA_CA_CERTS, cert);
  assert.equal(env.DB_TRUST_CERT, undefined);
  assert.equal(env.DB_SCHEMA, undefined);
  assert.equal(env.RUBY_PLATFORM_DB_PASSWORD, undefined);
  assert.equal(env.AUTH_TRUST_LOOPBACK_PROXY, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.PATH, "local-path");
  assert.equal(env.AUTH_HOST, "127.0.0.1");
  assert.equal(env.AUTH_PORT, "4400");
  assert.equal(env.AUTH_ALLOW_LOCAL_HTTP, "true");
  assert.equal(env.NODE_ENV, "development");
  assert.equal(env.DB_PASSWORD, bundle["athena-account-password.txt"].trim());
  assert.equal(
    env.AUTH_TOKEN_SECRET,
    bundle["athena-account-token.txt"].trim(),
  );
});
test("refuses unsafe targets, private keys, invalid configs and foreign login names", (t) => {
  const { d, cert } = fixture(t);
  for (const db of [
    "master",
    "MODEL",
    "msdb",
    "tempdb",
    "x];DROP DATABASE x",
    "",
  ])
    assert.throws(() => prepareRuntime(db, d, cert));
  const bundle = prepareRuntime("intrusionshield", d, cert);
  writeRuntime(d, bundle);
  const path = join(d, "athena-account-runtime.json"),
    original = readFileSync(path, "utf8");
  for (const patch of [
    { server: "remote.example" },
    { database: "master" },
    { port: 1434 },
    { user: "sa" },
    { extra: "x" },
  ]) {
    writeFileSync(path, JSON.stringify({ ...JSON.parse(original), ...patch }), {
      mode: 0o600,
    });
    assert.throws(() => runtimeEnvironment(path));
  }
  writeFileSync(path, original);
  writeFileSync(cert, "-----BEGIN PRIVATE KEY-----");
  assert.throws(() => runtimeEnvironment(path));
  assert.throws(() => prepareRuntime("intrusionshield", d, cert));
});
test("private bundle is exclusive and existing credentials survive repeated preparation", (t) => {
  const { d, cert } = fixture(t),
    b = prepareRuntime("intrusionshield", d, cert);
  writeRuntime(d, b);
  assert.throws(
    () => writeRuntime(d, prepareRuntime("intrusionshield", d, cert)),
    /already exist/,
  );
  assert.equal(
    readFileSync(join(d, "athena-account-password.txt"), "utf8"),
    b["athena-account-password.txt"],
  );
  assert.throws(() => writeRuntime(d, { "../outside": "no" }));
  if (process.platform !== "win32") {
    chmodSync(join(d, "athena-account-token.txt"), 0o644);
    assert.throws(() =>
      runtimeEnvironment(join(d, "athena-account-runtime.json")),
    );
  }
});
test("secret and configuration symlinks are refused", (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX symlink fixture");
    return;
  }
  const { d, cert } = fixture(t);
  const b = prepareRuntime("intrusionshield", d, cert);
  writeRuntime(d, b);
  const link = join(d, "linked.json");
  symlinkSync(join(d, "athena-account-runtime.json"), link);
  assert.throws(() => runtimeEnvironment(link));
});
