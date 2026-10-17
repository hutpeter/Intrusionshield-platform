#!/usr/bin/env node
/** Ruby SQL Server migrations: review by default; explicit guarded Athena apply. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromDatabase = createRequire(path.join(repoRoot, 'packages/database/package.json'));

export function splitBatches(source) {
  const batches = [];
  let lines = [];
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^\s*GO(?:\s+(\d+))?\s*(?:--.*)?$/i.exec(line);
    if (!match) { lines.push(line); continue; }
    const batch = lines.join('\n').trim();
    const repeats = Number(match[1] ?? 1);
    if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 100) throw new Error('Invalid GO repeat count.');
    if (batch) for (let i = 0; i < repeats; i++) batches.push(batch);
    lines = [];
  }
  const last = lines.join('\n').trim();
  if (last) batches.push(last);
  return batches;
}

export async function loadPlan(role, root = repoRoot) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'database-isolation/migration-manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported manifest version.');
  const config = manifest.roles[role];
  if (!config) throw new Error(`Unknown migration role: ${role}`);
  const names = config.orderedMigrations;
  if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length) throw new Error('Invalid migration list.');
  const excluded = new Set(config.excluded ?? []);
  const migrations = [];
  for (const name of names) {
    if (path.basename(name) !== name || !name.endsWith('.sql') || excluded.has(name)) throw new Error(`Unsafe migration filename: ${name}`);
    const sqlText = await fs.readFile(path.join(root, config.migrationRoot, name), 'utf8');
    migrations.push({ name, sha256: createHash('sha256').update(sqlText).digest('hex'), batches: splitBatches(sqlText) });
  }
  return migrations;
}

function parseArgs(args) {
  const flags = new Set(args);
  if (args.some(a => !['--role','ATHENA','BAS_EMS','TELEMETRY_ISOLATED','BAS_EMS_ISOLATED','--apply','--plan'].includes(a))) throw new Error('Usage: node database-isolation/migrate.mjs --role ATHENA [--plan|--apply]');
  const idx = args.indexOf('--role');
  if (idx < 0 || !args[idx+1] || (flags.has('--apply') && flags.has('--plan'))) throw new Error('Specify --role ATHENA, BAS_EMS, TELEMETRY_ISOLATED, or BAS_EMS_ISOLATED and optionally --apply.');
  return { role: args[idx+1], apply: flags.has('--apply') };
}

async function main() {
  const {role, apply} = parseArgs(process.argv.slice(2));
  const migrations = await loadPlan(role);
  console.log(JSON.stringify({ role, mode: apply ? 'APPLY' : 'PLAN', migrations: migrations.map(({name,sha256,batches}) => ({name,sha256,batches:batches.length})) }, null, 2));
  if (!apply) return;
  if (role !== 'ATHENA') throw new Error('Only ATHENA is approved for migration execution. BAS_EMS is plan-only.');
  if (process.env.RUBY_MIGRATION_CONFIRM !== 'ATHENA') throw new Error('Set RUBY_MIGRATION_CONFIRM=ATHENA to authorize apply.');
  const required = ['RUBY_ATHENA_DB_SERVER','RUBY_ATHENA_DB_DATABASE','RUBY_ATHENA_DB_USER','RUBY_ATHENA_DB_PASSWORD'];
  for (const key of required) if (!process.env[key]?.trim()) throw new Error(`${key} is required for migration apply (no fallback to shared DB).`);
  if (process.env.DB_DATABASE && process.env.RUBY_ATHENA_DB_DATABASE.toLowerCase() === process.env.DB_DATABASE.toLowerCase()) throw new Error('Athena target equals configured shared DB; refusing apply.');
  const sql = requireFromDatabase('mssql');
  const target = process.env.RUBY_ATHENA_DB_DATABASE;
  const port = Number(process.env.RUBY_ATHENA_DB_PORT ?? 1433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Athena database port.');
  const bool = (name, fallback) => {
    const value = process.env[name]?.toLowerCase();
    if (value === undefined) return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new Error(`Invalid ${name}; expected true/false.`);
  };
  const pool = new sql.ConnectionPool({
    server: process.env.RUBY_ATHENA_DB_SERVER, port, database: target,
    user: process.env.RUBY_ATHENA_DB_USER, password: process.env.RUBY_ATHENA_DB_PASSWORD,
    options: { encrypt: bool('RUBY_ATHENA_DB_ENCRYPT', true), trustServerCertificate: bool('RUBY_ATHENA_DB_TRUST_SERVER_CERTIFICATE', false) }
  });
  await pool.connect();
  const transaction = new sql.Transaction(pool);
  try {
    // Hold an exclusive session-bound application lock on a dedicated connection.
    // The transaction is intentionally NOT wrapped around migrations: several existing
    // Athena scripts manage their own transactions and rollback semantics.
    const lockRequest = new sql.Request(transaction);
    await transaction.begin();
    const lock = await lockRequest.query("DECLARE @r INT; EXEC @r = sp_getapplock @Resource=N'Ruby:Migration:ATHENA', @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=0; SELECT @r AS result;");
    if (lock.recordset[0].result < 0) throw new Error('Could not acquire exclusive Athena migration lock.');
    const existing = await pool.request().query("SELECT CASE WHEN OBJECT_ID(N'dbo.RubySchemaMigrations',N'U') IS NULL THEN 0 ELSE 1 END AS hasHistory, CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE schema_id=SCHEMA_ID(N'HIS')) THEN 1 ELSE 0 END AS hasHis;");
    const {hasHistory,hasHis} = existing.recordset[0];
    if (!hasHistory && hasHis) throw new Error('Existing HIS schema has no Ruby migration history; manual baseline required.');
    if (!hasHistory) {
      await pool.request().query("CREATE TABLE dbo.RubySchemaMigrations (role NVARCHAR(40) NOT NULL, migration_name NVARCHAR(260) NOT NULL, sha256 CHAR(64) NOT NULL, applied_at DATETIME2(7) NOT NULL CONSTRAINT DF_RubySchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME(), CONSTRAINT PK_RubySchemaMigrations PRIMARY KEY(role,migration_name));");
    }
    const history = await pool.request().input('role',sql.NVarChar(40),role).query('SELECT migration_name,sha256 FROM dbo.RubySchemaMigrations WHERE role=@role;');
    const applied = new Map(history.recordset.map(x => [x.migration_name,x.sha256]));
    const known = new Set(migrations.map(x => x.name));
    for (const [name] of applied) if (!known.has(name)) throw new Error(`Unknown applied migration: ${name}`);
    let encounteredMissing = false;
    for (const migration of migrations) {
      const checksum = applied.get(migration.name);
      if (checksum !== undefined) {
        if (encounteredMissing) throw new Error(`Out-of-order history: ${migration.name} applied after an unapplied migration.`);
        if (checksum.toLowerCase() !== migration.sha256) throw new Error(`Checksum mismatch: ${migration.name}`);
      } else encounteredMissing = true;
    }
    for (const migration of migrations) {
      if (applied.has(migration.name)) { console.log(`SKIP ${migration.name}`); continue; }
      console.log(`APPLY ${migration.name}`);
      for (const batch of migration.batches) await pool.request().batch(batch);
      await pool.request().input('role',sql.NVarChar(40),role).input('name',sql.NVarChar(260),migration.name).input('sha',sql.Char(64),migration.sha256)
        .query('INSERT INTO dbo.RubySchemaMigrations(role,migration_name,sha256) VALUES (@role,@name,@sha);');
      console.log(`APPLIED ${migration.name}`);
    }
  } finally {
    try { await transaction.rollback(); } catch {} // release application lock
    await pool.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Migration stopped: ${error.message}`); process.exitCode = 1; });
}
