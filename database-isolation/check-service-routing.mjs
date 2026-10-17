#!/usr/bin/env node
/**
 * Foundation 3C: read-only physical database routing preflight.
 * Connects only to the three explicitly named disposable smoke databases.
 * No DDL, DML, migration execution, or service reconfiguration.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDb = createRequire(path.join(root, 'packages/database/package.json'));
const targets = [
  { role: 'PLATFORM', database: 'Ruby_Isolation_Smoke_Platform', schema: 'Platform', minTables: 8 },
  { role: 'TELEMETRY', database: 'Ruby_Isolation_Smoke_Telemetry', schema: 'Telemetry', minTables: 6 },
  { role: 'BAS_EMS', database: 'Ruby_Isolation_Smoke_BasEms', schema: 'Energy', minTables: 12 }
];
const fail = message => { throw new Error(message); };

async function main() {
  if (process.argv.slice(2).join(' ') !== '--check')
    fail('Usage: node database-isolation/check-service-routing.mjs --check');
  const server = process.env.RUBY_ISOLATION_SMOKE_SERVER;
  const user = process.env.RUBY_ISOLATION_SMOKE_USER;
  const password = process.env.RUBY_ISOLATION_SMOKE_PASSWORD;
  if (!server || !user || !password)
    fail('Set RUBY_ISOLATION_SMOKE_SERVER, _USER and _PASSWORD (no defaults).');
  const port = Number(process.env.RUBY_ISOLATION_SMOKE_PORT ?? '1433');
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('Invalid SQL port.');
  const sql = requireDb('mssql');
  let failures = 0;
  for (const target of targets) {
    const pool = new sql.ConnectionPool({
      server, port, user, password, database: target.database,
      options: { encrypt: false, trustServerCertificate: true }
    });
    try {
      await pool.connect();
      const r = await pool.request()
        .input('schema', sql.NVarChar(128), target.schema)
        .query(
          "SELECT DB_NAME() AS databaseName, (SELECT COUNT(*) FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE s.name = @schema) AS tableCount"
        );
      const { databaseName, tableCount } = r.recordset[0];
      if (databaseName !== target.database || tableCount < target.minTables)
        fail('Unexpected database or schema inventory: ' + JSON.stringify({ databaseName, tableCount }));
      console.log('PASS ' + target.role + ': ' + databaseName + ', ' + tableCount + ' ' + target.schema + ' tables');
    } catch (error) {
      failures++;
      console.error('FAIL ' + target.role + ': ' + error.message);
    } finally {
      await pool.close().catch(() => {});
    }
  }
  if (failures) fail(failures + ' role(s) failed.');
  console.log('PASS: three separate role database connections verified (read-only).');
}
main().catch(error => { console.error('CHECK STOPPED: ' + error.message); process.exitCode = 1; });
