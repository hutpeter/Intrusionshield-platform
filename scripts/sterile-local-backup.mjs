import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  createReadStream,
  lstatSync,
  realpathSync,
  mkdirSync,
  openSync,
  closeSync,
  chmodSync,
  fsyncSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  existsSync,
  constants,
} from "node:fs";
import { dirname, join, resolve, isAbsolute, relative, sep } from "node:path";
import { createConnection } from "node:net";
import { execFileSync } from "node:child_process";
import { requirePrivateDirectory } from "./private-directory.mjs";
import { loadAccountConfiguration } from "../services/sterile-processing/runtime/config.mjs";
const limit = 2 * 1024 * 1024 * 1024;
export class LocalBackupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new LocalBackupError(code, message);
};
function absolute(path) {
  if (typeof path !== "string" || !isAbsolute(path))
    fail("INVALID_PATH", "Use explicit absolute paths.");
  return resolve(path);
}
function regular(path, max = limit, privateFile = true) {
  const file = absolute(path),
    stat = lstatSync(file);
  const same =
    process.platform === "win32"
      ? realpathSync(file).toLowerCase() === file.toLowerCase()
      : realpathSync(file) === file;
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    !same ||
    stat.nlink !== 1 ||
    stat.size > max ||
    (privateFile && process.platform !== "win32" && (stat.mode & 0o077) !== 0)
  )
    fail(
      "UNSAFE_FILE",
      "Files must be private, regular, bounded and free of links.",
    );
  if (privateFile) requirePrivateDirectory(dirname(file));
  return stat;
}
function newDirectory(parent, prefix) {
  const root = requirePrivateDirectory(absolute(parent));
  const target = join(
    root,
    prefix +
      "-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomUUID(),
  );
  mkdirSync(target, { mode: 0o700 });
  try {
    if (process.platform === "win32")
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:RUBY_STERILE_BACKUP_DIRECTORY; $a.SetAccessRuleProtection($true,$true); Set-Acl -LiteralPath $env:RUBY_STERILE_BACKUP_DIRECTORY -AclObject $a",
        ],
        {
          env: { ...process.env, RUBY_STERILE_BACKUP_DIRECTORY: target },
          stdio: "pipe",
        },
      );
    requirePrivateDirectory(target);
    return target;
  } catch (error) {
    rmSync(target, { recursive: true, force: true });
    throw error;
  }
}
function sync(file) {
  const fd = openSync(file, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
async function digest(file) {
  regular(file);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export async function requireStopped(origin) {
  const port = Number(new URL(origin).port);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    fail("INVALID_PATH", "An explicit valid runtime port is required.");
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(1500);
    socket.once("connect", () => {
      socket.destroy();
      reject(
        new LocalBackupError(
          "RUNTIME_RUNNING",
          "Stop the local account runtime before backup or restore.",
        ),
      );
    });
    socket.once("error", (error) => {
      socket.destroy();
      error.code === "ECONNREFUSED"
        ? resolve()
        : reject(
            new LocalBackupError(
              "RUNTIME_CHECK_FAILED",
              "Could not establish that the local runtime is stopped.",
            ),
          );
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(
        new LocalBackupError(
          "RUNTIME_CHECK_FAILED",
          "Could not establish that the local runtime is stopped.",
        ),
      );
    });
  });
}
function inspect(file, kind, config) {
  regular(file);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA trusted_schema=OFF; PRAGMA query_only=ON");
    if (
      db.prepare("PRAGMA quick_check(1)").get()?.quick_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").get()
    )
      fail(
        "INVALID_DATABASE",
        "Database integrity or references failed validation.",
      );
    if (
      db
        .prepare(
          "SELECT 1 FROM sqlite_schema WHERE type IN ('trigger','view') LIMIT 1",
        )
        .get()
    )
      fail(
        "UNSUPPORTED_SCHEMA",
        "Custom database views or triggers are not supported by this local backup format.",
      );
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => r.name);
    const required =
      kind === "workflow"
        ? [
            "sp_local_store_mode",
            "sp_instruments",
            "sp_audit",
            "sp_receipts",
            "sp_recalls",
            "sp_recall_instruments",
            "sp_processing_holds",
          ]
        : ["sterile_user_access", "sterile_access_changes"];
    if (
      required.some((t) => !tables.includes(t)) ||
      tables.some((t) =>
        kind === "workflow" ? !/^sp_[a-z_]+$/.test(t) : !required.includes(t),
      )
    )
      fail(
        "WRONG_STORE",
        "Select the account workflow and access stores, not preview or unrelated databases.",
      );
    if (
      kind === "workflow" &&
      (db.prepare("SELECT count(*) AS n FROM sp_local_store_mode").get().n !==
        1 ||
        db.prepare("SELECT mode FROM sp_local_store_mode WHERE id=1").get()
          ?.mode !== "account")
    )
      fail(
        "WRONG_STORE",
        "Only explicitly marked account workflow stores can be backed up or restored.",
      );
    const counts = {};
    for (const table of tables) {
      const name = '"' + table + '"';
      counts[table] = db.prepare("SELECT count(*) AS n FROM " + name).get().n;
      if (table === "sp_local_store_mode") continue;
      const columns = db
        .prepare("PRAGMA table_info(" + name + ")")
        .all()
        .map((r) => r.name);
      if (
        !columns.includes("tenant_id") ||
        (kind === "workflow" && !columns.includes("facility_id"))
      )
        fail("UNSUPPORTED_SCHEMA", "Unrecognized local database schema.");
      const foreign =
        kind === "workflow"
          ? db
              .prepare(
                "SELECT 1 FROM " +
                  name +
                  " WHERE tenant_id<>? OR facility_id<>? LIMIT 1",
              )
              .get(config.tenantId, config.facilityId)
          : db
              .prepare("SELECT 1 FROM " + name + " WHERE tenant_id<>? LIMIT 1")
              .get(config.tenantId);
      if (foreign)
        fail(
          "SCOPE_MISMATCH",
          "Database records do not match this configured tenant/facility.",
        );
      if (
        columns.includes("payload") &&
        db
          .prepare(
            "SELECT 1 FROM " + name + " WHERE NOT json_valid(payload) LIMIT 1",
          )
          .get()
      )
        fail("INVALID_DATABASE", "A stored payload is invalid.");
    }
    return counts;
  } finally {
    db.close();
  }
}
const binding = (config) => ({
  tenantId: config.tenantId,
  facilityId: config.facilityId,
  identitySource: {
    server: config.identityDatabase.server,
    port: config.identityDatabase.port,
    database: config.identityDatabase.database,
  },
});
async function fileInfo(file) {
  const stat = regular(file);
  return { bytes: stat.size, sha256: await digest(file) };
}
function equalKeys(value, keys) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",")
  );
}
function loadManifest(directory, config) {
  const root = requirePrivateDirectory(absolute(directory)),
    file = join(root, "manifest.json");
  regular(file, 65536);
  const v = JSON.parse(readFileSync(file, "utf8"));
  if (
    !equalKeys(v, [
      "format",
      "version",
      "backupId",
      "capturedAt",
      "tenantId",
      "facilityId",
      "identitySource",
      "files",
      "tableCounts",
    ]) ||
    v.format !== "ruby-sterile-account-backup" ||
    v.version !== 1 ||
    typeof v.backupId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      v.backupId,
    ) ||
    typeof v.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(v.capturedAt)) ||
    !equalKeys(v.identitySource, ["server", "port", "database"]) ||
    !equalKeys(v.files, ["workflow", "access"]) ||
    !equalKeys(v.tableCounts, ["workflow", "access"])
  )
    fail("INVALID_MANIFEST", "Unsupported or malformed backup manifest.");
  if (
    JSON.stringify({
      tenantId: v.tenantId,
      facilityId: v.facilityId,
      identitySource: {
        server: v.identitySource.server,
        port: v.identitySource.port,
        database: v.identitySource.database,
      },
    }) !== JSON.stringify(binding(config))
  )
    fail(
      "SCOPE_MISMATCH",
      "Backup belongs to a different configured tenant, facility or SQL identity source.",
    );
  for (const kind of ["workflow", "access"]) {
    const info = v.files[kind],
      counts = v.tableCounts[kind];
    if (
      !equalKeys(info, ["bytes", "sha256"]) ||
      !Number.isSafeInteger(info.bytes) ||
      info.bytes < 1 ||
      info.bytes > limit ||
      typeof info.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(info.sha256) ||
      !counts ||
      typeof counts !== "object" ||
      Array.isArray(counts) ||
      Object.keys(counts).length > 100 ||
      Object.entries(counts).some(
        ([key, n]) =>
          !/^[_a-z]+$/.test(key) || !Number.isSafeInteger(n) || n < 0,
      )
    )
      fail("INVALID_MANIFEST", "Malformed backup file metadata.");
  }
  return { root, manifest: v };
}
function noSidecars(file) {
  if (["-wal", "-shm", "-journal"].some((suffix) => existsSync(file + suffix)))
    fail(
      "UNSAFE_BUNDLE",
      "A backup must be self-contained with no SQLite sidecars.",
    );
}
async function verifyFiles(root, manifest, config) {
  for (const kind of ["workflow", "access"]) {
    const file = join(root, kind + ".sqlite");
    noSidecars(file);
    const info = await fileInfo(file);
    if (
      info.bytes !== manifest.files[kind].bytes ||
      info.sha256 !== manifest.files[kind].sha256
    )
      fail(
        "CHECKSUM_MISMATCH",
        "Backup file size or checksum does not match its manifest.",
      );
    const counts = inspect(file, kind, config);
    if (
      JSON.stringify(Object.entries(counts).sort()) !==
      JSON.stringify(Object.entries(manifest.tableCounts[kind]).sort())
    )
      fail(
        "INVALID_DATABASE",
        "Backup table counts differ from the recorded snapshot.",
      );
  }
}
export async function verifyAccountBackup(configFile, backupDirectory) {
  const config = loadAccountConfiguration(absolute(configFile));
  const { root, manifest } = loadManifest(backupDirectory, config);
  await verifyFiles(root, manifest, config);
  return { directory: root, manifest };
}
export async function backupAccount(configFile, parent, progress = () => {}) {
  progress("configuration");
  const config = loadAccountConfiguration(absolute(configFile));
  progress("runtime stopped check");
  await requireStopped(config.origin);
  const sources = { workflow: config.workflowFile, access: config.accessFile },
    locks = [];
  let directory;
  try {
    for (const kind of ["workflow", "access"]) {
      progress(kind + " source privacy and write reservation");
      regular(sources[kind]);
      const lock = new DatabaseSync(sources[kind]);
      locks.push(lock);
      lock.exec("PRAGMA busy_timeout=0; BEGIN IMMEDIATE");
    }
    const capturedAt = new Date().toISOString(),
      tableCounts = {};
    for (const kind of ["workflow", "access"]) {
      progress(kind + " source integrity");
      tableCounts[kind] = inspect(sources[kind], kind, config);
    }
    progress("destination directory privacy");
    directory = newDirectory(parent, "sterile-backup");
    const files = {};
    for (const kind of ["workflow", "access"]) {
      progress(kind + " snapshot creation and verification");
      const target = join(directory, kind + ".sqlite");
      closeSync(openSync(target, "wx", 0o600));
      const source = new DatabaseSync(sources[kind], { readOnly: true });
      try {
        await sqliteBackup(source, target);
      } finally {
        source.close();
      }
      const output = new DatabaseSync(target);
      try {
        output.exec("PRAGMA journal_mode=DELETE");
      } finally {
        output.close();
      }
      chmodSync(target, 0o600);
      sync(target);
      noSidecars(target);
      files[kind] = await fileInfo(target);
    }
    const manifest = {
      format: "ruby-sterile-account-backup",
      version: 1,
      backupId: randomUUID(),
      capturedAt,
      ...binding(config),
      files,
      tableCounts,
    };
    progress("paired snapshot verification");
    await verifyFiles(directory, manifest, config);
    progress("manifest publication");
    const manifestFile = join(directory, "manifest.json");
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    sync(manifestFile);
    return { directory, manifest };
  } catch (error) {
    if (directory) rmSync(directory, { recursive: true, force: true });
    throw error;
  } finally {
    for (const lock of locks.reverse()) {
      try {
        lock.exec("ROLLBACK");
      } catch {
        /* A failed BEGIN has no transaction. */
      }
      lock.close();
    }
  }
}
export async function restoreAccountBackup(
  configFile,
  backupDirectory,
  parent,
) {
  const configPath = absolute(configFile),
    config = loadAccountConfiguration(configPath);
  await requireStopped(config.origin);
  const { root, manifest } = loadManifest(backupDirectory, config);
  await verifyFiles(root, manifest, config);
  const destination = requirePrivateDirectory(absolute(parent));
  const nested = relative(root, destination);
  if (
    !nested ||
    (nested !== ".." && !nested.startsWith(".." + sep) && !isAbsolute(nested))
  )
    fail("INVALID_PATH", "Restore outside the original backup bundle.");
  let directory;
  try {
    directory = newDirectory(parent, "sterile-restored");
    for (const kind of ["workflow", "access"]) {
      const target = join(directory, kind + ".sqlite");
      copyFileSync(
        join(root, kind + ".sqlite"),
        target,
        constants.COPYFILE_EXCL,
      );
      chmodSync(target, 0o600);
      sync(target);
    }
    // Recheck the copies against the frozen manifest, not a mutable source path.
    await verifyFiles(directory, manifest, config);
    regular(configPath, 65536, false);
    const raw = JSON.parse(
      readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""),
    );
    raw.workflowFile = join(directory, "workflow.sqlite");
    raw.accessFile = join(directory, "access.sqlite");
    const restoredConfig = join(directory, "account-restored.json");
    writeFileSync(restoredConfig, JSON.stringify(raw, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    const restored = loadAccountConfiguration(restoredConfig);
    if (JSON.stringify(binding(restored)) !== JSON.stringify(binding(config)))
      fail(
        "CONFIGURATION_CHANGED",
        "The configured identity source changed during restore.",
      );
    sync(restoredConfig);
    const record = join(directory, "restore-record.json");
    writeFileSync(
      record,
      JSON.stringify(
        {
          format: "ruby-sterile-account-restore",
          version: 1,
          fromBackupId: manifest.backupId,
          capturedAt: manifest.capturedAt,
          restoredAt: new Date().toISOString(),
          reviewRestoredGrantsBeforeUse: true,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    sync(record);
    return { directory, configFile: restoredConfig, manifest };
  } catch (error) {
    if (directory) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
