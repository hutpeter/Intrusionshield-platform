import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  lstatSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  readdirSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { PasswordHasher } from "../services/authentication/dist/security/PasswordHasher.js";
import { sterilePermissions } from "../services/sterile-processing/dist/security/access.js";
import {
  prepareTestUsers,
  requirePrivateDirectory,
  writeTestUserFiles,
} from "./sterile-test-users.mjs";
const config = () => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  facilityId: randomUUID(),
  facilityName: "Local account verification",
  identityDatabase: {
    server: "localhost",
    port: 1433,
    database: "intrusionshield",
  },
});
const passwords = () => ({
  operatorPassword: "Local operator password '🔐' 123",
  reviewerPassword: "Local reviewer password 4567890",
});
function directory(t) {
  const root = mkdtempSync(join(tmpdir(), "sterile-test-users-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test("prepared test credentials use the existing Ruby hasher without plaintext passwords in any file", async () => {
  const f = await prepareTestUsers(config(), passwords()),
    hashes = [
      ...f["verification-users.sql"].matchAll(/N'(scrypt\$[\w-]+\$[\w-]+)'/g),
    ].map((x) => x[1]);
  assert.equal(hashes.length, 2);
  const hasher = new PasswordHasher();
  assert.equal(
    await hasher.verify(passwords().operatorPassword, hashes[0]),
    true,
  );
  assert.equal(
    await hasher.verify(passwords().reviewerPassword, hashes[1]),
    true,
  );
  for (const value of Object.values(passwords()))
    for (const output of Object.values(f))
      assert.equal(output.includes(value), false);
  assert.ok(f["verification-users.sql"].includes("BEGIN TRANSACTION"));
  assert.ok(f["verification-users.sql"].includes("ROLLBACK"));
  assert.ok(f["verification-users.sql"].includes("UPDLOCK, HOLDLOCK"));
  assert.equal(
    /CREATE\s+(LOGIN|TABLE|USER)|ALTER\s|UPDATE\s|DELETE\s|GRANT\s/i.test(
      f["verification-users.sql"],
    ),
    false,
  );
});
test("operator and reviewer grants use separate test persons and exclude each other’s critical permissions", async () => {
  const c = config(),
    f = await prepareTestUsers(c, passwords()),
    o = JSON.parse(f["operator-access.json"]),
    r = JSON.parse(f["reviewer-access.json"]);
  assert.notEqual(o.actorId, r.actorId);
  assert.notEqual(o.personId, r.personId);
  assert.notEqual(o.actorId, o.personId);
  assert.equal(o.expectedVersion, 0);
  assert.equal(r.expectedVersion, 0);
  assert.equal(o.facilities[0].facilityId, c.facilityId);
  assert.ok(o.facilities[0].permissions.includes("processing:write"));
  assert.ok(!o.facilities[0].permissions.includes("processing:inspect"));
  assert.ok(r.facilities[0].permissions.includes("processing:inspect"));
  assert.ok(!r.facilities[0].permissions.includes("processing:write"));
  for (const change of [o, r])
    for (const p of change.facilities[0].permissions)
      assert.ok(sterilePermissions.includes(p));
  for (const change of [o, r])
    assert.ok(f["verification-users.sql"].includes(change.actorId));
});
test("preparation refuses other tenants, remote or other databases/facilities and malformed passwords", async () => {
  for (const patch of [
    { tenantId: randomUUID() },
    { facilityName: "Client pilot" },
    { facilityId: "invalid" },
    {
      identityDatabase: {
        server: "remote",
        port: 1433,
        database: "intrusionshield",
      },
    },
    { identityDatabase: { server: "localhost", port: 1433, database: "CMS" } },
  ])
    await assert.rejects(() =>
      prepareTestUsers({ ...config(), ...patch }, passwords()),
    );
  for (const body of [
    {},
    { ...passwords(), extra: true },
    { ...passwords(), operatorPassword: "short" },
    { ...passwords(), reviewerPassword: passwords().operatorPassword },
    { ...passwords(), operatorPassword: "x".repeat(129) },
    { ...passwords(), operatorPassword: "x".repeat(25) + "\n" },
  ])
    await assert.rejects(() => prepareTestUsers(config(), body));
});
test("private exclusive output preserves existing files and rejects linked directories", async (t) => {
  const root = directory(t),
    f = await prepareTestUsers(config(), passwords());
  writeTestUserFiles(root, f);
  assert.deepEqual(
    readFileSync(join(root, "verification-users.sql"), "utf8"),
    f["verification-users.sql"],
  );
  if (process.platform !== "win32")
    assert.equal(
      lstatSync(join(root, "verification-users.sql")).mode & 0o777,
      0o600,
    );
  assert.throws(() => writeTestUserFiles(root, f), /already exists/);
  assert.deepEqual(
    readFileSync(join(root, "operator-access.json"), "utf8"),
    f["operator-access.json"],
  );
  const other = join(root, "other");
  mkdirSync(other, { mode: 0o700 });
  writeFileSync(join(other, "reviewer-access.json"), "keep");
  assert.throws(() => writeTestUserFiles(other, f));
  assert.deepEqual(readdirSync(other), ["reviewer-access.json"]);
  if (process.platform !== "win32") {
    const link = join(root, "link");
    symlinkSync(other, link);
    assert.throws(() => requirePrivateDirectory(link));
    chmodSync(other, 0o755);
    assert.throws(() => requirePrivateDirectory(other));
  }
  assert.throws(() => writeTestUserFiles(root, { "../unsafe": "bad" }));
});
test("CLI rejects invalid input without printing passwords or opening a SQL connection", () => {
  const marker = "DO-NOT-PRINT-THIS-PASSWORD";
  const result = spawnSync(
    process.execPath,
    ["scripts/sterile-account-prepare-test-users.mjs", "--config", "relative"],
    {
      encoding: "utf8",
      input: JSON.stringify({
        operatorPassword: marker,
        reviewerPassword: marker,
      }),
    },
  );
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes(marker), false);
  assert.ok(result.stderr.includes("Nothing was sent to SQL Server"));
});

test("complete preparation CLI uses bounded UTF-8 input, writes only the private bundle and refuses a second preparation", async (t) => {
  const root = directory(t),
    secretDir = join(root, "secrets");
  mkdirSync(secretDir, { mode: 0o700 });
  const { execFileSync } = await import("node:child_process");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(root, "key.pem"),
      "-out",
      join(root, "cert.pem"),
      "-subj",
      "/CN=localhost",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  chmodSync(join(root, "key.pem"), 0o600);
  writeFileSync(
    join(secretDir, "identity-password.txt"),
    "Fictional database password",
    { mode: 0o600 },
  );
  writeFileSync(
    join(secretDir, "token-secret.txt"),
    "test-only-signing-key-material-01234567890123456789",
    { mode: 0o600 },
  );
  const c = config(),
    file = join(root, "account.json");
  writeFileSync(
    file,
    JSON.stringify({
      ...c,
      origin: "https://localhost:9554",
      timeZone: "America/New_York",
      workflowFile: join(root, "workflow.sqlite"),
      accessFile: join(root, "access.sqlite"),
      tls: {
        certificateFile: join(root, "cert.pem"),
        privateKeyFile: join(root, "key.pem"),
      },
      identityDatabase: {
        ...c.identityDatabase,
        user: "fictional-reader",
        passwordFile: join(secretDir, "identity-password.txt"),
      },
      tokens: {
        issuer: "test-issuer",
        audience: "test-audience",
        secretFile: join(secretDir, "token-secret.txt"),
        lifetimeSeconds: 1800,
      },
    }),
  );
  const run = (input) =>
    spawnSync(
      process.execPath,
      ["scripts/sterile-account-prepare-test-users.mjs", "--config", file],
      { encoding: "utf8", input },
    );
  let result = run(JSON.stringify(passwords()));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("No SQL connection was opened"));
  assert.equal(
    lstatSync(join(secretDir, "verification-users.sql")).isFile(),
    true,
  );
  assert.equal(readdirSync(root).includes("workflow.sqlite"), false);
  assert.equal(readdirSync(root).includes("access.sqlite"), false);
  const original = readFileSync(
    join(secretDir, "verification-users.sql"),
    "utf8",
  );
  result = run(JSON.stringify(passwords()));
  assert.equal(result.status, 1);
  assert.equal(
    readFileSync(join(secretDir, "verification-users.sql"), "utf8"),
    original,
  );
  result = run("x".repeat(5000));
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("x".repeat(100)), false);
  for (const value of Object.values(passwords()))
    assert.equal((result.stdout + result.stderr).includes(value), false);
});
