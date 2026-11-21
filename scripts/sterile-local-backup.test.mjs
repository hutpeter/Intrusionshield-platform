import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  readdirSync,
  copyFileSync,
  symlinkSync,
  linkSync,
  statSync,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import {
  backupAccount,
  verifyAccountBackup,
  restoreAccountBackup,
} from "./sterile-local-backup.mjs";
import { LocalSqliteSterileRepository } from "../services/sterile-processing/dist/persistence/sqlite.js";
import { SqliteSterileAccessDirectory } from "../services/sterile-processing/dist/security/sqlite-access.js";
import {
  InstrumentRegistry,
  ProcessingRegistry,
} from "../packages/sterile-processing/dist/index.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_ACCOUNT_ENABLED = "true";
delete process.env.RUBY_STERILE_PREVIEW;
async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "sterile-local-backup-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
  writeFileSync(join(root, "password.secret"), "DO-NOT-COPY-SQL-PASSWORD", {
    mode: 0o600,
  });
  writeFileSync(
    join(root, "token.secret"),
    "DO-NOT-COPY-TOKEN-SECRET-" + randomBytes(32).toString("hex"),
    { mode: 0o600 },
  );
  const holder = createServer();
  holder.listen(0, "127.0.0.1");
  await once(holder, "listening");
  const port = holder.address().port;
  await new Promise((r) => holder.close(r));
  const scope = {
    tenantId: randomUUID(),
    facilityId: randomUUID(),
    actorId: randomUUID(),
    personId: randomUUID(),
  };
  const raw = {
    origin: "https://127.0.0.1:" + port,
    tenantId: scope.tenantId,
    facilityId: scope.facilityId,
    facilityName: "Isolated backup test",
    timeZone: "UTC",
    workflowFile: join(root, "workflow.sqlite"),
    accessFile: join(root, "access.sqlite"),
    tls: {
      certificateFile: join(root, "cert.pem"),
      privateKeyFile: join(root, "key.pem"),
    },
    identityDatabase: {
      server: "identity.invalid",
      port: 1433,
      database: "TestIdentity",
      user: "read-only",
      passwordFile: join(root, "password.secret"),
    },
    tokens: {
      issuer: "test-ruby",
      audience: "sterile",
      secretFile: join(root, "token.secret"),
      lifetimeSeconds: 1800,
    },
  };
  const configFile = join(root, "account.json");
  writeFileSync(configFile, JSON.stringify(raw), { mode: 0o600 });
  const repo = new LocalSqliteSterileRepository(raw.workflowFile, "account"),
    instruments = new InstrumentRegistry(repo),
    type = await instruments.createType(scope, {
      requestId: randomUUID(),
      code: "BACKUP-TYPE",
      name: "Fictional instrument",
      manufacturer: "Fictional",
      model: "",
    }),
    instrument = await instruments.register(scope, {
      requestId: randomUUID(),
      instrumentTypeId: type.id,
      code: "BACKUP-INS",
      serialNumber: "FICTITIOUS",
    }),
    episode = await new ProcessingRegistry(repo).receive(scope, {
      requestId: randomUUID(),
      code: "BACKUP-REC",
      source: "Fictional",
      custodian: "Test custodian",
      condition: "Used",
      discrepancies: "",
      instrumentIds: [instrument.id],
      confirmed: true,
    });
  repo.close();
  // Persistence fixture for an existing recall block; this is not a new clinical workflow acceptance.
  const db = new DatabaseSync(raw.workflowFile),
    recallId = randomUUID();
  db.exec("PRAGMA foreign_keys=ON");
  db.prepare("INSERT INTO sp_recalls VALUES(?,?,?,?,?,?)").run(
    scope.tenantId,
    scope.facilityId,
    recallId,
    "BACKUP-RECALL",
    1,
    JSON.stringify({ id: recallId, state: "open", code: "BACKUP-RECALL" }),
  );
  db.prepare("INSERT INTO sp_recall_instruments VALUES(?,?,?,?)").run(
    scope.tenantId,
    scope.facilityId,
    instrument.id,
    recallId,
  );
  db.close();
  const access = new SqliteSterileAccessDirectory(raw.accessFile);
  let user = access.replaceAccess(
    {
      tenantId: scope.tenantId,
      actorId: scope.actorId,
      personId: scope.personId,
      status: "ACTIVE",
      facilities: [
        {
          facilityId: scope.facilityId,
          capabilityEnabled: true,
          permissions: ["access:manage", "reports:read"],
        },
      ],
    },
    {
      expectedVersion: 0,
      changedBy: scope.actorId,
      reason: "Initial test enrollment",
    },
  );
  user = access.replaceAccess(user, {
    expectedVersion: 1,
    changedBy: scope.actorId,
    reason: "Preserved audit evidence",
  });
  access.close();
  return { root, raw, configFile, scope, instrument, episode, user };
}
const bundles = (f) =>
  readdirSync(f.root).filter(
    (n) => n.startsWith("sterile-backup-") || n.startsWith("sterile-restored-"),
  );
test("backs up both stores, verifies hashes and restores isolated records, versions, holds and grants without changing originals", async (t) => {
  const f = await fixture(t),
    b = await backupAccount(f.configFile, f.root);
  assert.deepEqual(readdirSync(b.directory).sort(), [
    "access.sqlite",
    "manifest.json",
    "workflow.sqlite",
  ]);
  assert.equal(b.manifest.tableCounts.workflow.sp_processing_holds, 1);
  assert.equal(b.manifest.tableCounts.workflow.sp_recall_instruments, 1);
  assert.equal(b.manifest.tableCounts.access.sterile_access_changes, 2);
  await verifyAccountBackup(f.configFile, b.directory);
  const originalAccess = new SqliteSterileAccessDirectory(f.raw.accessFile);
  originalAccess.replaceAccess(
    {
      ...f.user,
      facilities: [
        {
          facilityId: f.scope.facilityId,
          capabilityEnabled: false,
          permissions: [],
        },
      ],
    },
    {
      expectedVersion: 2,
      changedBy: f.scope.actorId,
      reason: "Later revocation stays in original",
    },
  );
  originalAccess.close();
  const restored = await restoreAccountBackup(
    f.configFile,
    b.directory,
    f.root,
  );
  assert.notEqual(restored.configFile, f.configFile);
  assert.notEqual(restored.directory, b.directory);
  assert.deepEqual(JSON.parse(readFileSync(f.configFile, "utf8")), f.raw);
  const copied = JSON.parse(readFileSync(restored.configFile, "utf8"));
  assert.equal(
    copied.workflowFile,
    join(restored.directory, "workflow.sqlite"),
  );
  assert.equal(
    copied.identityDatabase.passwordFile,
    f.raw.identityDatabase.passwordFile,
  );
  assert.equal(copied.tls.privateKeyFile, f.raw.tls.privateKeyFile);
  const repo = new LocalSqliteSterileRepository(copied.workflowFile, "account");
  try {
    const instrument = await new InstrumentRegistry(repo).get(
      f.scope,
      f.instrument.id,
    );
    assert.equal(instrument.processingHold.episodeId, f.episode.id);
    assert.equal(instrument.recall.caseCode, "BACKUP-RECALL");
    assert.equal(instrument.recall.state, "open");
  } finally {
    repo.close();
  }
  const restoredAccess = new SqliteSterileAccessDirectory(copied.accessFile);
  assert.deepEqual(
    await restoredAccess.findUser(f.scope.tenantId, f.scope.actorId),
    f.user,
  );
  assert.equal(
    restoredAccess.facilityHistory(
      f.scope.tenantId,
      f.scope.actorId,
      f.scope.facilityId,
    )[0].reason,
    "Initial test enrollment",
  );
  restoredAccess.close();
  const current = new SqliteSterileAccessDirectory(f.raw.accessFile);
  assert.equal(
    (await current.findUser(f.scope.tenantId, f.scope.actorId)).version,
    3,
  );
  current.close();
  for (const file of readdirSync(b.directory)) {
    const contents = readFileSync(join(b.directory, file));
    assert.equal(contents.includes(Buffer.from("DO-NOT-COPY")), false);
    if (process.platform !== "win32")
      assert.equal(statSync(join(b.directory, file)).mode & 0o077, 0);
  }
  assert.equal(
    JSON.parse(
      readFileSync(join(restored.directory, "restore-record.json"), "utf8"),
    ).reviewRestoredGrantsBeforeUse,
    true,
  );
});
test("SQLite backup includes committed WAL data that a main-file-only copy misses", async (t) => {
  const f = await fixture(t),
    writer = new DatabaseSync(f.raw.workflowFile);
  t.after(() => writer.close());
  writer.exec("PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0");
  const before = writer
    .prepare("SELECT count(*) AS n FROM sp_receipts")
    .get().n;
  writer
    .prepare("INSERT INTO sp_receipts VALUES(?,?,?,?)")
    .run(
      f.scope.tenantId,
      f.scope.facilityId,
      randomUUID(),
      JSON.stringify({ fixture: "WAL-only committed evidence" }),
    );
  assert.ok(statSync(f.raw.workflowFile + "-wal").size > 0);
  const incomplete = join(f.root, "main-only.sqlite");
  copyFileSync(f.raw.workflowFile, incomplete);
  chmodSync(incomplete, 0o600);
  const old = new DatabaseSync(incomplete, { readOnly: true });
  assert.equal(
    old.prepare("SELECT count(*) AS n FROM sp_receipts").get().n,
    before,
  );
  old.close();
  const b = await backupAccount(f.configFile, f.root);
  const copy = new DatabaseSync(join(b.directory, "workflow.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    copy.prepare("SELECT count(*) AS n FROM sp_receipts").get().n,
    before + 1,
  );
  copy.close();
  await verifyAccountBackup(f.configFile, b.directory);
});
test("refuses running local runtime and occupied source stores before publishing a backup", async (t) => {
  const f = await fixture(t),
    server = createServer();
  server.listen(Number(new URL(f.raw.origin).port), "127.0.0.1");
  await once(server, "listening");
  try {
    await assert.rejects(
      () => backupAccount(f.configFile, f.root),
      (e) => e.code === "RUNTIME_RUNNING",
    );
    assert.deepEqual(bundles(f), []);
  } finally {
    await new Promise((r) => server.close(r));
  }
  const lock = new DatabaseSync(f.raw.accessFile);
  lock.exec("BEGIN IMMEDIATE");
  try {
    await assert.rejects(() => backupAccount(f.configFile, f.root));
    assert.deepEqual(bundles(f), []);
    const workflow = new DatabaseSync(f.raw.workflowFile);
    workflow.exec("PRAGMA busy_timeout=0;BEGIN IMMEDIATE;ROLLBACK");
    workflow.close();
  } finally {
    lock.exec("ROLLBACK");
    lock.close();
  }
});
test("detects damaged files before restoring and keeps originals and existing bundles intact", async (t) => {
  const f = await fixture(t),
    b = await backupAccount(f.configFile, f.root),
    configBefore = readFileSync(f.configFile, "utf8");
  appendFileSync(join(b.directory, "workflow.sqlite"), "corrupt");
  await assert.rejects(
    () => verifyAccountBackup(f.configFile, b.directory),
    (e) => e.code === "CHECKSUM_MISMATCH",
  );
  await assert.rejects(
    () => restoreAccountBackup(f.configFile, b.directory, f.root),
    (e) => e.code === "CHECKSUM_MISMATCH",
  );
  assert.deepEqual(bundles(f), [b.directory.split(/[\\/]/).at(-1)]);
  assert.equal(readFileSync(f.configFile, "utf8"), configBefore);
});
test("refuses preview, swapped and foreign-scope sources without initializing or overwriting them", async (t) => {
  const f = await fixture(t),
    db = new DatabaseSync(f.raw.workflowFile);
  db.prepare("UPDATE sp_local_store_mode SET mode='preview'").run();
  db.close();
  await assert.rejects(
    () => backupAccount(f.configFile, f.root),
    (e) => e.code === "WRONG_STORE",
  );
  assert.deepEqual(bundles(f), []);
  const raw = {
    ...f.raw,
    workflowFile: f.raw.accessFile,
    accessFile: f.raw.workflowFile,
  };
  writeFileSync(f.configFile, JSON.stringify(raw));
  await assert.rejects(
    () => backupAccount(f.configFile, f.root),
    (e) => e.code === "WRONG_STORE",
  );
  writeFileSync(
    f.configFile,
    JSON.stringify({ ...f.raw, facilityId: randomUUID() }),
  );
  const reset = new DatabaseSync(f.raw.workflowFile);
  reset.exec("UPDATE sp_local_store_mode SET mode='account'");
  reset.close();
  await assert.rejects(
    () => backupAccount(f.configFile, f.root),
    (e) => e.code === "SCOPE_MISMATCH",
  );
});
test("binds a bundle to its configured tenant/facility and SQL identity source and rejects traversal-shaped manifests", async (t) => {
  const f = await fixture(t),
    b = await backupAccount(f.configFile, f.root);
  writeFileSync(
    f.configFile,
    JSON.stringify({
      ...f.raw,
      identityDatabase: {
        ...f.raw.identityDatabase,
        database: "OtherIdentity",
      },
    }),
  );
  await assert.rejects(
    () => verifyAccountBackup(f.configFile, b.directory),
    (e) => e.code === "SCOPE_MISMATCH",
  );
  writeFileSync(f.configFile, JSON.stringify(f.raw));
  const manifest = JSON.parse(
    readFileSync(join(b.directory, "manifest.json"), "utf8"),
  );
  manifest.files.workflow.name = "../workflow.sqlite";
  writeFileSync(join(b.directory, "manifest.json"), JSON.stringify(manifest));
  await assert.rejects(
    () => verifyAccountBackup(f.configFile, b.directory),
    (e) => e.code === "INVALID_MANIFEST",
  );
});
test("rejects symlinked, hard-linked and non-private sources or destinations", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX links/modes; Windows ACL checks require owner execution");
    return;
  }
  const f = await fixture(t),
    link = join(f.root, "workflow-link.sqlite");
  symlinkSync(f.raw.workflowFile, link);
  writeFileSync(f.configFile, JSON.stringify({ ...f.raw, workflowFile: link }));
  await assert.rejects(
    () => backupAccount(f.configFile, f.root),
    (e) => e.code === "UNSAFE_FILE",
  );
  writeFileSync(f.configFile, JSON.stringify(f.raw));
  const hard = join(f.root, "hard-link.sqlite");
  linkSync(f.raw.workflowFile, hard);
  await assert.rejects(
    () => backupAccount(f.configFile, f.root),
    (e) => e.code === "UNSAFE_FILE",
  );
  rmSync(hard);
  chmodSync(f.raw.accessFile, 0o644);
  await assert.rejects(
    () => backupAccount(f.configFile, f.root),
    (e) => e.code === "UNSAFE_FILE",
  );
  chmodSync(f.raw.accessFile, 0o600);
  const outside = mkdtempSync(join(tmpdir(), "unsafe-destination-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  chmodSync(outside, 0o755);
  await assert.rejects(() => backupAccount(f.configFile, outside));
  assert.deepEqual(bundles(f), []);
});
test("CLI creates, verifies and restores private copies without printing secrets or touching SQL", async (t) => {
  const f = await fixture(t),
    run = (args) =>
      spawnSync(
        process.execPath,
        ["scripts/sterile-account-backup.mjs", ...args],
        { encoding: "utf8" },
      );
  let r = run(["backup", "--config", f.configFile, "--directory", f.root]);
  assert.equal(r.status, 0, r.stderr);
  const b = join(f.root, bundles(f)[0]);
  r = run(["verify", "--config", f.configFile, "--backup", b]);
  assert.equal(r.status, 0, r.stderr);
  r = run([
    "restore",
    "--config",
    f.configFile,
    "--backup",
    b,
    "--directory",
    f.root,
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /original configuration and stores were not replaced/);
  assert.equal(r.stdout.includes("DO-NOT-COPY"), false);
  assert.equal(
    run(["backup", "--config", "relative", "--directory", f.root]).status,
    1,
  );
  assert.equal(
    run(["restore", "--config", f.configFile, "--backup", b]).status,
    1,
  );
});

test("detects same-length corruption and SQLite sidecars and refuses restoring inside a completed bundle", async (t) => {
  const f = await fixture(t),
    b = await backupAccount(f.configFile, f.root),
    file = join(b.directory, "access.sqlite"),
    original = readFileSync(file),
    changed = Buffer.from(original);
  changed[changed.length - 1] ^= 1;
  writeFileSync(file, changed);
  await assert.rejects(
    () => verifyAccountBackup(f.configFile, b.directory),
    (e) => e.code === "CHECKSUM_MISMATCH",
  );
  writeFileSync(file, original);
  writeFileSync(file + "-wal", "unhashed external data", { mode: 0o600 });
  await assert.rejects(
    () => verifyAccountBackup(f.configFile, b.directory),
    (e) => e.code === "UNSAFE_BUNDLE",
  );
  rmSync(file + "-wal");
  await assert.rejects(
    () => restoreAccountBackup(f.configFile, b.directory, b.directory),
    (e) => e.code === "INVALID_PATH",
  );
  assert.deepEqual(readdirSync(b.directory).sort(), [
    "access.sqlite",
    "manifest.json",
    "workflow.sqlite",
  ]);
  await verifyAccountBackup(f.configFile, b.directory);
});
test("rejects inconsistent database references and does not publish an incomplete pair", async (t) => {
  const f = await fixture(t),
    db = new DatabaseSync(f.raw.workflowFile);
  db.exec("PRAGMA foreign_keys=OFF");
  db.prepare("INSERT INTO sp_recall_instruments VALUES(?,?,?,?)").run(
    f.scope.tenantId,
    f.scope.facilityId,
    randomUUID(),
    randomUUID(),
  );
  db.close();
  await assert.rejects(
    () => backupAccount(f.configFile, f.root),
    (e) => e.code === "INVALID_DATABASE",
  );
  assert.deepEqual(bundles(f), []);
});
