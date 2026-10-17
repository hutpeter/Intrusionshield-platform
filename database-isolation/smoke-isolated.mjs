#!/usr/bin/env node
/**
 * Review-only isolated SQL smoke test. Operates ONLY on three pre-created,
 * empty, disposable databases with exact hard-coded names.
 * Never creates, drops, restores, or alters any other database.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlan } from './migrate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDb = createRequire(path.join(root, 'packages/database/package.json'));
const targets = Object.freeze({
  PLATFORM_ISOLATED: 'Ruby_Isolation_Smoke_Platform',
  TELEMETRY_ISOLATED: 'Ruby_Isolation_Smoke_Telemetry',
  BAS_EMS_ISOLATED: 'Ruby_Isolation_Smoke_BasEms'
});

function fail(message) { throw new Error(message); }

async function main() {
  if (process.argv.slice(2).join(' ') !== '--run')
    fail('Usage: node database-isolation/smoke-isolated.mjs --run');
  if (process.env.RUBY_ISOLATION_SMOKE_CONFIRM !== 'DISPOSABLE_ONLY')
    fail('Set RUBY_ISOLATION_SMOKE_CONFIRM=DISPOSABLE_ONLY.');
  const server = process.env.RUBY_ISOLATION_SMOKE_SERVER;
  const user = process.env.RUBY_ISOLATION_SMOKE_USER;
  const password = process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
  if (!server || !user || !password) fail('Explicit RUBY_ISOLATION_SMOKE_SERVER, _USER, and _PASSWORD required.');
  const port = Number(process.env.RUBY_ISOLATION_SMOKE_PORT ?? '1433');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Invalid port.');
  const sql = requireDb('mssql');
  const options = { encrypt: false, trustServerCertificate: true };
  const pools = [];
  try {
    // Preflight ALL three targets before running ANY migration.
    for (const [role, database] of Object.entries(targets)) {
      const pool = new sql.ConnectionPool({ server, port, user, password, database, options });
      await pool.connect();
      pools.push({ role, database, pool });
      const result = await pool.request().query(
        "SELECT DB_NAME() AS currentDb, (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped = 0) AS tableCount, (SELECT COUNT(*) FROM sys.views WHERE is_ms_shipped = 0) AS viewCount"
      );
      const row = result.recordset[0];
      if (row.currentDb !== database) fail('Database name mismatch: ' + row.currentDb);
      if (row.tableCount !== 0 || row.viewCount !== 0)
        fail('Target must be empty: ' + database + ' (tables=' + row.tableCount + ', views=' + row.viewCount + ')');
      console.log('PREFLIGHT OK ' + role + ' -> ' + database);
    }
    for (const { role, database, pool } of pools) {
      const migrations = await loadPlan(role);
      for (const migration of migrations) {
        console.log('RUN ' + role + '/' + migration.name);
        for (const batch of migration.batches) await pool.request().batch(batch);
        console.log('PASS ' + role + '/' + migration.name);
      }
      const summary = await pool.request().query(
        "SELECT s.name AS schemaName, COUNT(*) AS tableCount FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id GROUP BY s.name ORDER BY s.name"
      );
      console.log(JSON.stringify({ role, database, tables: summary.recordset }));
    }
    console.log('SMOKE PASS: all three disposable databases.');
  } finally {
    await Promise.allSettled(pools.map(({ pool }) => pool.close()));
  }
}
main().catch(error => { console.error('SMOKE STOPPED: ' + error.message); process.exitCode = 1; });
