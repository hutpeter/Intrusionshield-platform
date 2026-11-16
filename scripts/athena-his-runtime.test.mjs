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
  prepareHisRuntime,
  writeHisRuntime,
  hisRuntimeEnvironment,
} from "./athena-his-runtime.mjs";
function fixture(t) {
  const d = mkdtempSync(join(tmpdir(), "athena-his-runtime-"));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  const cert = join(d, "sql-ca.pem");
  writeFileSync(
    cert,
    "-----BEGIN CERTIFICATE-----\npublic-test-fixture\n-----END CERTIFICATE-----\n",
  );
  return { d, cert };
}
test("HIS runtime prepares separate credentials and explicit product table grants, not account or owner privileges", (t) => {
  const { d, cert } = fixture(t),
    bundle = prepareHisRuntime("intrusionshield", d, cert),
    sql = bundle["athena-his-login.sql"],
    c = JSON.parse(bundle["athena-his-runtime.json"]);
  assert.equal(c.runtimeKind, "ATHENA_HIS_LOCAL");
  assert.match(c.user, /^ruby_athena_his_[a-f0-9]{16}$/);
  assert.equal(c.database, "intrusionshield");
  const grants = sql.split("\n").filter((l) => l.includes(" GRANT "));
  assert.equal(grants.length, 57);
  assert.ok(grants.every((l) => l.includes("ON OBJECT::[HIS].")));
  assert.ok(
    grants.some((l) =>
      l.includes("DELETE ON OBJECT::[HIS].[PersonIdentifiers]"),
    ),
  );
  assert.ok(
    grants.some((l) => l.includes("UPDATE ON OBJECT::[HIS].[Persons]")),
  );
  assert.ok(
    grants.every((l) => !l.includes("DELETE ON OBJECT::[HIS].[Persons]")),
  );
  assert.doesNotMatch(
    sql,
    /ALTER ROLE|ALTER SERVER ROLE|GRANT CONTROL|GRANT ALTER|CREATE TABLE|INSERT INTO|UPDATE \[HIS\]|GRANT .*ON SCHEMA/i,
  );
  const password = bundle["athena-his-password.txt"].trim();
  assert.equal(password.length, 46);
  assert.ok(sql.includes(password));
  assert.equal(JSON.stringify(c).includes(password), false);
  assert.equal(c.tokenSecretFile, undefined);
  assert.match(sql, /SUSER_ID/);
  assert.match(sql, /Required HIS table missing/);
});
test("launcher clears inherited DB/auth configuration and fixes verified SQL TLS and loopback authorization", (t) => {
  const { d, cert } = fixture(t),
    b = prepareHisRuntime("intrusionshield", d, cert);
  writeHisRuntime(d, b);
  const env = hisRuntimeEnvironment(join(d, "athena-his-runtime.json"), {
    PATH: "keep",
    RUBY_ATHENA_DB_DATABASE: "wrong",
    RUBY_PLATFORM_DB_PASSWORD: "account-secret",
    DB_TRUST_CERT: "true",
    AUTH_TOKEN_SECRET: "account-key",
    HIS_AUTHORIZATION_ORIGIN: "http://untrusted",
    HIS_HOST: "0.0.0.0",
    NODE_OPTIONS: "--require wrong",
  });
  assert.equal(env.DB_DATABASE, "intrusionshield");
  assert.equal(env.DB_USERNAME, JSON.parse(b["athena-his-runtime.json"]).user);
  assert.equal(env.DB_PASSWORD, b["athena-his-password.txt"].trim());
  assert.equal(env.DB_ENCRYPT, "true");
  assert.equal(env.DB_TRUST_SERVER_CERTIFICATE, "false");
  assert.equal(env.NODE_EXTRA_CA_CERTS, cert);
  assert.equal(env.HIS_HOST, "127.0.0.1");
  assert.equal(env.HIS_PORT, "4300");
  assert.equal(env.HIS_AUTHORIZATION_ORIGIN, "http://127.0.0.1:4400");
  assert.equal(env.RUBY_ATHENA_DB_DATABASE, undefined);
  assert.equal(env.RUBY_PLATFORM_DB_PASSWORD, undefined);
  assert.equal(env.AUTH_TOKEN_SECRET, undefined);
  assert.equal(env.DB_TRUST_CERT, undefined);
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.PATH, "keep");
});
test("refuses system databases, injection, relative directory, swapped account config and private CA keys", (t) => {
  const { d, cert } = fixture(t);
  for (const db of [
    "master",
    "model",
    "MSDB",
    "tempdb",
    "x];DROP DATABASE x",
    "",
  ])
    assert.throws(() => prepareHisRuntime(db, d, cert));
  assert.throws(() => prepareHisRuntime("intrusionshield", "relative", cert));
  const b = prepareHisRuntime("intrusionshield", d, cert);
  writeHisRuntime(d, b);
  const path = join(d, "athena-his-runtime.json"),
    original = JSON.parse(b["athena-his-runtime.json"]);
  for (const patch of [
    { runtimeKind: "ATHENA_ACCOUNTS" },
    { user: "ruby_athena_accounts_0000000000000000" },
    { server: "remote" },
    { port: 1434 },
    { database: "master" },
    { extra: "x" },
  ]) {
    writeFileSync(path, JSON.stringify({ ...original, ...patch }));
    assert.throws(() => hisRuntimeEnvironment(path));
  }
  writeFileSync(path, JSON.stringify(original));
  writeFileSync(cert, "-----BEGIN PRIVATE KEY-----");
  assert.throws(() => hisRuntimeEnvironment(path));
  assert.throws(() => prepareHisRuntime("intrusionshield", d, cert));
});
test("exclusive private output preserves existing secrets and rejects public secret files", (t) => {
  const { d, cert } = fixture(t),
    b = prepareHisRuntime("intrusionshield", d, cert);
  writeHisRuntime(d, b);
  assert.throws(
    () => writeHisRuntime(d, prepareHisRuntime("intrusionshield", d, cert)),
    /already exist/,
  );
  assert.equal(
    readFileSync(join(d, "athena-his-password.txt"), "utf8"),
    b["athena-his-password.txt"],
  );
  assert.throws(() => writeHisRuntime(d, { "../outside": "x" }));
  if (process.platform !== "win32") {
    chmodSync(join(d, "athena-his-password.txt"), 0o644);
    assert.throws(() =>
      hisRuntimeEnvironment(join(d, "athena-his-runtime.json")),
    );
  }
});
test("linked runtime configs are refused", (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX symlink fixture");
    return;
  }
  const { d, cert } = fixture(t),
    b = prepareHisRuntime("intrusionshield", d, cert);
  writeHisRuntime(d, b);
  const linked = join(d, "linked.json");
  symlinkSync(join(d, "athena-his-runtime.json"), linked);
  assert.throws(() => hisRuntimeEnvironment(linked));
});
