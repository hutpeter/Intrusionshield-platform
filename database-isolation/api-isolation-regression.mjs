#!/usr/bin/env node
/**
 * Opt-in, disposable-database API isolation regression.
 * Requires a separately started split-mode service and explicit SQL credentials.
 * Never targets legacy or Athena databases; cleans up only records created here.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireDb = createRequire(path.join(root, 'packages/database/package.json'));
const sql = requireDb('mssql');
const telemetryDb = 'Ruby_Isolation_Smoke_Telemetry';
const energyDb = 'Ruby_Isolation_Smoke_BasEms';
const tenantA = '00000000-0000-0000-0000-000000000001';
const tenantB = '00000000-0000-0000-0000-000000000002';
const siteIdPattern = /^[0-9a-f-]{36}$/i;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const required = name => {
  const value = process.env[name];
  assert(value && value.trim(), 'Missing ' + name);
  return value;
};

async function request(base, method, route, tenant, body) {
  const response = await fetch(base + route, {
    method,
    headers: { 'x-tenant-id': tenant, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  return { status: response.status, data };
}

async function main() {
  assert(process.argv.slice(2).join(' ') === '--run', 'Usage: node database-isolation/api-isolation-regression.mjs --run');
  assert(process.env.RUBY_ISOLATION_API_TEST_CONFIRM === 'DISPOSABLE_ONLY',
    'Set RUBY_ISOLATION_API_TEST_CONFIRM=DISPOSABLE_ONLY to authorize test writes and targeted cleanup.');
  assert(process.env.RUBY_TELEMETRY_ENERGY_SPLIT_DATABASES === 'true',
    'Set RUBY_TELEMETRY_ENERGY_SPLIT_DATABASES=true in this test window.');
  assert(process.env.RUBY_TELEMETRY_DB_DATABASE === telemetryDb &&
    process.env.RUBY_BAS_EMS_DB_DATABASE === energyDb,
    'Test database names must match the two dedicated Ruby_Isolation_Smoke databases.');
  const server = required('RUBY_ISOLATION_SMOKE_SERVER');
  const user = required('RUBY_ISOLATION_SMOKE_USER');
  const password = required('RUBY_ISOLATION_SMOKE_PASSWORD');
  const port = Number(process.env.RUBY_ISOLATION_SMOKE_PORT ?? '1433');
  assert(Number.isInteger(port) && port >= 1 && port <= 65535, 'Invalid SQL port.');
  const base = process.env.RUBY_ISOLATION_API_URL ?? 'http://localhost:4411';
  assert(/^http:\/\/localhost:4411\/?$/.test(base),
    'For safety, API target must be http://localhost:4411.');
  const pools = [];
  let siteId = null, contractId = null;
  const siteCode = 'RUBY-ISOLATION-' + randomUUID().slice(0, 8);
  const contractNumber = 'RUBY-ISO-' + randomUUID().slice(0, 8);
  let completed = false;
  try {
    for (const database of [telemetryDb, energyDb]) {
      const pool = new sql.ConnectionPool({
        server, port, user, password, database,
        options: { encrypt: false, trustServerCertificate: true }
      });
      await pool.connect();
      pools.push(pool);
      const result = await pool.request().query('SELECT DB_NAME() AS name');
      assert(result.recordset[0]?.name === database, 'Unexpected SQL database connection.');
    }
    const [telemetry, energy] = pools;
    const site = await request(base, 'POST', '/api/v1/telemetry/sites', tenantA,
      { code: siteCode, name: 'Ruby Automated Isolation Test', timezone: 'America/Toronto', status: 'ACTIVE' });
    assert(site.status === 201 || site.status === 200, 'Site POST failed: ' + JSON.stringify(site));
    siteId = site.data?.id;
    assert(siteIdPattern.test(siteId ?? ''), 'Site POST did not return a valid id.');
    const siteRead = await request(base, 'GET', '/api/v1/telemetry/sites/' + siteId, tenantA);
    assert(siteRead.status === 200 && siteRead.data?.id?.toLowerCase() === siteId.toLowerCase(), 'Site read-back failed.');
    const siteDenied = await request(base, 'GET', '/api/v1/telemetry/sites/' + siteId, tenantB);
    assert(siteDenied.status === 404, 'Tenant B could access Telemetry site (HTTP ' + siteDenied.status + ').');
    const siteSql = await telemetry.request().input('id', sql.UniqueIdentifier, siteId)
      .input('code', sql.NVarChar(128), siteCode)
      .query('SELECT COUNT(*) AS n FROM Telemetry.Sites WHERE id=@id AND code=@code');
    assert(siteSql.recordset[0].n === 1, 'Site missing from isolated Telemetry database.');
    console.log('PASS: Telemetry create/read/tenant isolation/physical persistence');

    const contract = await request(base, 'POST', '/api/v1/energy/contracts', tenantA, {
      contractNumber, name: 'Ruby Automated Isolation Test', vendorName: 'Ruby Test Vendor',
      contractType: 'MAINTENANCE', startDate: '2026-10-18', endDate: '2027-10-18', status: 'ACTIVE'
    });
    assert(contract.status === 201 || contract.status === 200, 'Contract POST failed: ' + JSON.stringify(contract));
    contractId = contract.data?.id;
    assert(siteIdPattern.test(contractId ?? ''), 'Contract POST did not return a valid id.');
    const contractRead = await request(base, 'GET', '/api/v1/energy/contracts/' + contractId, tenantA);
    assert(contractRead.status === 200 && contractRead.data?.id?.toLowerCase() === contractId.toLowerCase(), 'Contract read-back failed.');
    const contractDenied = await request(base, 'GET', '/api/v1/energy/contracts/' + contractId, tenantB);
    assert(contractDenied.status === 404, 'Tenant B could access Energy contract (HTTP ' + contractDenied.status + ').');
    const contractSql = await energy.request().input('id', sql.UniqueIdentifier, contractId)
      .input('number', sql.NVarChar(128), contractNumber)
      .query('SELECT COUNT(*) AS n FROM Energy.Contracts WHERE id=@id AND contract_number=@number');
    assert(contractSql.recordset[0].n === 1, 'Contract missing from isolated BAS/EMS database.');
    console.log('PASS: BAS/EMS create/read/tenant isolation/physical persistence');
    completed = true;
  } finally {
    // Only records created by this run, in explicitly checked disposable databases.
    // A failure in cleanup is reported and causes a nonzero exit.
    let cleanupFailed = false;
    if (contractId && pools[1]) {
      try {
        const r = await pools[1].request()
          .input('id', sql.UniqueIdentifier, contractId)
          .input('tenant', sql.UniqueIdentifier, tenantA)
          .input('number', sql.NVarChar(128), contractNumber)
          .query('DELETE FROM Energy.Contracts WHERE id=@id AND tenant_id=@tenant AND contract_number=@number');
        assert(r.rowsAffected[0] === 1, 'Contract cleanup did not delete exactly one record.');
        console.log('PASS: BAS/EMS test contract cleanup');
      } catch (e) { cleanupFailed = true; console.error('CLEANUP FAILED (contract): ' + e.message); }
    }
    if (siteId && pools[0]) {
      try {
        const r = await pools[0].request()
          .input('id', sql.UniqueIdentifier, siteId)
          .input('tenant', sql.UniqueIdentifier, tenantA)
          .input('code', sql.NVarChar(128), siteCode)
          .query('DELETE FROM Telemetry.Sites WHERE id=@id AND tenant_id=@tenant AND code=@code');
        assert(r.rowsAffected[0] === 1, 'Site cleanup did not delete exactly one record.');
        console.log('PASS: Telemetry test site cleanup');
      } catch (e) { cleanupFailed = true; console.error('CLEANUP FAILED (site): ' + e.message); }
    }
    for (const pool of pools) await pool.close().catch(() => {});
    if (cleanupFailed) process.exitCode = 1;
  }
  if (completed && !process.exitCode) console.log('PASS: isolated API regression and cleanup complete.');
}
main().catch(error => { console.error('FAIL: ' + error.message); process.exitCode = 1; });
