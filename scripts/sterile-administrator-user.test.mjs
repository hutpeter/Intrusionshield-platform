import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  lstatSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import {
  prepareAdministratorUser,
  writeAdministratorFiles,
} from "./sterile-administrator-user.mjs";
import { PasswordHasher } from "../services/authentication/dist/security/PasswordHasher.js";
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
const password = "Private admin '🔐' 1234567890";
function directory(t) {
  const root = mkdtempSync(join(tmpdir(), "sterile-dedicated-admin-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test("prepares one dedicated USER with the real salted hasher and only access administration", async () => {
  const c = config(),
    files = await prepareAdministratorUser(c, {
      administratorPassword: password,
    }),
    sql = files["administrator-user.sql"],
    grant = JSON.parse(files["administrator-access.json"]);
  const hashes = [...sql.matchAll(/N'(scrypt\$[\w-]+\$[\w-]+)'/g)].map(
    (x) => x[1],
  );
  assert.equal(hashes.length, 1);
  assert.equal(await new PasswordHasher().verify(password, hashes[0]), true);
  assert.equal(
    Object.values(files).some((s) => s.includes(password)),
    false,
  );
  assert.ok(sql.includes("N'sterile.admin.test'"));
  assert.ok(sql.includes("N'USER', N'ACTIVE'"));
  assert.equal((sql.match(/INSERT INTO/g) || []).length, 3);
  assert.ok(sql.includes("UPDLOCK, HOLDLOCK"));
  assert.ok(sql.includes("ROLLBACK"));
  assert.ok(sql.includes("SERIALIZABLE"));
  assert.ok(sql.includes("already exists"));
  assert.equal(
    /CREATE\s+(LOGIN|USER|TABLE)|ALTER\s|UPDATE\s|DELETE\s|GRANT\s/i.test(sql),
    false,
  );
  assert.equal(grant.actorId, grant.changedBy);
  assert.notEqual(grant.actorId, grant.personId);
  assert.equal(grant.expectedVersion, 0);
  assert.equal(grant.tenantId, c.tenantId);
  assert.deepEqual(grant.facilities, [
    {
      facilityId: c.facilityId,
      capabilityEnabled: true,
      permissions: ["access:manage"],
    },
  ]);
  assert.ok(sql.includes(grant.actorId));
  assert.match(grant.reason, /OS bootstrap/);
  const second = await prepareAdministratorUser(c, {
    administratorPassword: password,
  });
  assert.notEqual(second["administrator-user.sql"], sql);
});
test("refuses foreign workspaces, invalid and extra password input", async () => {
  for (const patch of [
    { tenantId: randomUUID() },
    { facilityName: "Production" },
    {
      identityDatabase: {
        server: "remote.example",
        port: 1433,
        database: "intrusionshield",
      },
    },
    { facilityId: "';DROP TABLE" },
  ])
    await assert.rejects(() =>
      prepareAdministratorUser(
        { ...config(), ...patch },
        { administratorPassword: password },
      ),
    );
  for (const input of [
    null,
    [],
    { administratorPassword: "short" },
    { administratorPassword: "x".repeat(129) },
    { administratorPassword: password + "\n" },
    { administratorPassword: password, extra: true },
    { reviewerPassword: password },
  ])
    await assert.rejects(() => prepareAdministratorUser(config(), input));
});
test("writes private exclusive files and never overwrites existing evidence or follows symlinks", async (t) => {
  const root = directory(t),
    files = await prepareAdministratorUser(config(), {
      administratorPassword: password,
    });
  writeAdministratorFiles(root, files);
  const before = readFileSync(join(root, "administrator-user.sql"), "utf8");
  assert.equal(before, files["administrator-user.sql"]);
  assert.throws(() => writeAdministratorFiles(root, files));
  assert.equal(
    readFileSync(join(root, "administrator-user.sql"), "utf8"),
    before,
  );
  assert.throws(() => writeAdministratorFiles(root, { "../other": "bad" }));
  if (process.platform !== "win32") {
    assert.equal(
      lstatSync(join(root, "administrator-user.sql")).mode & 0o077,
      0,
    );
    const linked = join(root, "linked");
    symlinkSync(root, linked);
    assert.throws(() => writeAdministratorFiles(linked, files));
  }
});
test("CLI rejects unsafe input without printing the password", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/sterile-account-prepare-administrator.mjs",
      "--config",
      "relative",
    ],
    {
      encoding: "utf8",
      input: JSON.stringify({ administratorPassword: password }),
    },
  );
  assert.equal(result.status, 1);
  assert.equal((result.stdout + result.stderr).includes(password), false);
  assert.match(result.stderr, /Nothing was sent to SQL Server/);
});
test("complete CLI prepares only the dedicated private bundle with no SQL connection or store changes", async (t) => {
  const root = directory(t),
    secrets = join(root, "secrets");
  mkdirSync(secrets, { mode: 0o700 });
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
    join(secrets, "identity-password.txt"),
    "Fictional SQL password",
    { mode: 0o600 },
  );
  writeFileSync(
    join(secrets, "token-secret.txt"),
    "test-only-012345678901234567890123456789",
    { mode: 0o600 },
  );
  const c = config(),
    file = join(root, "account.json");
  writeFileSync(
    file,
    JSON.stringify({
      ...c,
      origin: "https://localhost:9554",
      timeZone: "UTC",
      workflowFile: join(root, "workflow.sqlite"),
      accessFile: join(root, "access.sqlite"),
      tls: {
        certificateFile: join(root, "cert.pem"),
        privateKeyFile: join(root, "key.pem"),
      },
      identityDatabase: {
        ...c.identityDatabase,
        user: "fictional-reader",
        passwordFile: join(secrets, "identity-password.txt"),
      },
      tokens: {
        issuer: "test",
        audience: "test",
        secretFile: join(secrets, "token-secret.txt"),
        lifetimeSeconds: 1800,
      },
    }),
  );
  const run = (input) =>
    spawnSync(
      process.execPath,
      ["scripts/sterile-account-prepare-administrator.mjs", "--config", file],
      { encoding: "utf8", input },
    );
  let result = run(
    "\uFEFF" + JSON.stringify({ administratorPassword: password }),
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sterile.admin.test/);
  assert.match(result.stdout, /no account created/i);
  assert.equal((result.stdout + result.stderr).includes(password), false);
  assert.equal(readdirSync(root).includes("workflow.sqlite"), false);
  assert.equal(readdirSync(root).includes("access.sqlite"), false);
  const before = readFileSync(
    join(secrets, "administrator-access.json"),
    "utf8",
  );
  result = run(JSON.stringify({ administratorPassword: password }));
  assert.equal(result.status, 1);
  assert.equal(
    readFileSync(join(secrets, "administrator-access.json"), "utf8"),
    before,
  );
  assert.equal(run("x".repeat(5000)).status, 1);
});
