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
  let siteId = null, siteBId = null, assetId = null, deviceId = null, contractId = null;
  const siteCode = 'RUBY-ISOLATION-' + randomUUID().slice(0, 8);
  const contractNumber = 'RUBY-ISO-' + randomUUID().slice(0, 8);
  const siteBCode = 'RUBY-ISOLATION-' + randomUUID().slice(0, 8);
  const assetCode = 'RUBY-ISO-ASSET-' + randomUUID().slice(0, 8);
  const deviceCode = 'RUBY-ISO-DEVICE-' + randomUUID().slice(0, 8);
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

    // Foundation 4: rejected references must never create Energy records.
    const missingSite = randomUUID();
    const missingAsset = randomUUID();
    const missingDevice = randomUUID();
    const commandBody = (site, extra = {}) => ({
      siteId: site, commandType: 'SET_TEMPERATURE',
      commandPayload: { setpoint: 72 }, ...extra
    });
    const contractBody = (site, number) => ({
      contractNumber: number, name: 'Rejected Reference Test',
      vendorName: 'Ruby Test Vendor', contractType: 'MAINTENANCE',
      startDate: '2026-10-18', endDate: '2027-10-18',
      status: 'ACTIVE', siteId: site
    });
    const rejected = async (label, route, tenant, body) => {
      const result = await request(base, 'POST', route, tenant, body);
      assert(result.status === 400,
        label + ' should return HTTP 400, got ' + result.status + ': ' + JSON.stringify(result.data));
      console.log('PASS: rejected ' + label);
    };
    await rejected('nonexistent BAS command site',
      '/api/v1/energy/bas/commands', tenantA, commandBody(missingSite));
    await rejected('cross-tenant BAS command site',
      '/api/v1/energy/bas/commands', tenantB, commandBody(siteId));
    await rejected('nonexistent BAS command asset',
      '/api/v1/energy/bas/commands', tenantA, commandBody(siteId, { assetId: missingAsset }));
    await rejected('nonexistent BAS command device',
      '/api/v1/energy/bas/commands', tenantA, commandBody(siteId, { deviceId: missingDevice }));
    await rejected('nonexistent Energy contract site',
      '/api/v1/energy/contracts', tenantA, contractBody(missingSite, 'RUBY-REJECT-' + randomUUID().slice(0, 8)));
    await rejected('cross-tenant Energy contract site',
      '/api/v1/energy/contracts', tenantB, contractBody(siteId, 'RUBY-REJECT-' + randomUUID().slice(0, 8)));
    await rejected('nonexistent contract coverage site',
      '/api/v1/energy/contracts/' + contractId + '/coverage', tenantA, { siteId: missingSite });
    await rejected('nonexistent contract coverage asset',
      '/api/v1/energy/contracts/' + contractId + '/coverage', tenantA, { assetId: missingAsset });
    // Two real sites plus an asset and device allow wrong-site and cross-tenant checks.
    const secondSite = await request(base, 'POST', '/api/v1/telemetry/sites', tenantA,
      { code: siteBCode, name: 'Ruby Isolation Second Site', timezone: 'America/Toronto', status: 'ACTIVE' });
    assert(secondSite.status === 201 || secondSite.status === 200, 'Second site POST failed: ' + JSON.stringify(secondSite));
    siteBId = secondSite.data?.id;
    assert(siteIdPattern.test(siteBId ?? ''), 'Second site POST did not return a valid id.');
    const asset = await request(base, 'POST', '/api/v1/telemetry/assets', tenantA,
      { siteId, code: assetCode, name: 'Ruby Isolation Asset', assetType: 'HVAC', status: 'ACTIVE' });
    assert(asset.status === 201 || asset.status === 200, 'Asset POST failed: ' + JSON.stringify(asset));
    assetId = asset.data?.id;
    assert(siteIdPattern.test(assetId ?? ''), 'Asset POST did not return a valid id.');
    const device = await request(base, 'POST', '/api/v1/telemetry/devices', tenantA,
      { siteId, code: deviceCode, name: 'Ruby Isolation Device', deviceType: 'SENSOR', status: 'ONLINE' });
    assert(device.status === 201 || device.status === 200, 'Device POST failed: ' + JSON.stringify(device));
    deviceId = device.data?.id;
    assert(siteIdPattern.test(deviceId ?? ''), 'Device POST did not return a valid id.');
    await rejected('wrong-site BAS command asset',
      '/api/v1/energy/bas/commands', tenantA, commandBody(siteBId, { assetId }));
    await rejected('wrong-site BAS command device',
      '/api/v1/energy/bas/commands', tenantA, commandBody(siteBId, { deviceId }));
    await rejected('cross-tenant BAS command asset',
      '/api/v1/energy/bas/commands', tenantB, commandBody(siteId, { assetId }));
    await rejected('cross-tenant BAS command device',
      '/api/v1/energy/bas/commands', tenantB, commandBody(siteId, { deviceId }));
    await rejected('wrong-site contract coverage asset',
      '/api/v1/energy/contracts/' + contractId + '/coverage', tenantA,
      { siteId: siteBId, assetId });
    console.log('PASS: wrong-site and cross-tenant asset/device references rejected');
    // Foundation 4: validate remaining Energy-to-Telemetry write references.
    const flowBody = (site, extra = {}) => ({
      siteId: site, direction: 'IMPORT', powerKw: 1.5,
      observedAt: '2026-10-18T12:00:00.000Z', source: 'ISOLATION_TEST', ...extra
    });
    const metricBody = (site, extra = {}) => ({
      siteId: site, metricCode: 'RUBY_ISOLATION_METRIC', value: 1,
      periodStart: '2026-10-18T00:00:00.000Z',
      periodEnd: '2026-10-18T01:00:00.000Z', source: 'ISOLATION_TEST', ...extra
    });
    const alarmBody = (site) => ({
      siteId: site, measurementCode: 'RUBY_ISOLATION_POINT',
      name: 'Ruby Rejected Alarm Rule', operator: 'GT',
      threshold: 100, severity: 'WARNING', enabled: true
    });
    await rejected('nonexistent Energy Flow site',
      '/api/v1/energy/flows', tenantA, flowBody(missingSite));
    await rejected('cross-tenant Energy Flow site',
      '/api/v1/energy/flows', tenantB, flowBody(siteId));
    await rejected('nonexistent Alarm Rule site',
      '/api/v1/energy/alarm-rules', tenantA, alarmBody(missingSite));
    await rejected('cross-tenant Alarm Rule site',
      '/api/v1/energy/alarm-rules', tenantB, alarmBody(siteId));
    await rejected('nonexistent Performance Metric site',
      '/api/v1/energy/performance-metrics', tenantA, metricBody(missingSite));
    await rejected('cross-tenant Performance Metric site',
      '/api/v1/energy/performance-metrics', tenantB, metricBody(siteId));
    await rejected('nonexistent Performance Metric asset',
      '/api/v1/energy/performance-metrics', tenantA, metricBody(siteId, { assetId: missingAsset }));
    await rejected('wrong-site Performance Metric asset',
      '/api/v1/energy/performance-metrics', tenantA, metricBody(siteBId, { assetId }));
    await rejected('cross-tenant Performance Metric asset',
      '/api/v1/energy/performance-metrics', tenantB, metricBody(siteId, { assetId }));
    await rejected('nonexistent Contract Maintenance asset',
      '/api/v1/energy/contracts/' + contractId + '/maintenance', tenantA,
      { assetId: missingAsset, activity: 'Rejected maintenance test', status: 'PLANNED' });
    console.log('PASS: Energy Flow, Alarm Rule, Performance Metric and Maintenance invalid references rejected');
    const commandCount = await energy.request()
      .input('site', sql.UniqueIdentifier, siteId)
      .input('tenant', sql.UniqueIdentifier, tenantA)
      .query('SELECT COUNT(*) AS n FROM Energy.BasEquipmentCommands WHERE site_id=@site AND tenant_id=@tenant');
    assert(commandCount.recordset[0].n === 0, 'Rejected BAS commands created records.');
    const coverageCount = await energy.request()
      .input('contract', sql.UniqueIdentifier, contractId)
      .query('SELECT COUNT(*) AS n FROM Energy.ContractCoverage WHERE contract_id=@contract');
    assert(coverageCount.recordset[0].n === 0, 'Rejected contract coverage created records.');
    console.log('PASS: rejected cross-database references left no BAS commands or contract coverage');
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
    // Delete children before their sites; never delete by tenant alone.
    for (const [id, code, table, label] of [
      [deviceId, deviceCode, 'Devices', 'device'],
      [assetId, assetCode, 'Assets', 'asset']
    ]) {
      if (!id || !pools[0]) continue;
      try {
        const r = await pools[0].request()
          .input('id', sql.UniqueIdentifier, id)
          .input('tenant', sql.UniqueIdentifier, tenantA)
          .input('code', sql.NVarChar(128), code)
          .query('DELETE FROM Telemetry.' + table + ' WHERE id=@id AND tenant_id=@tenant AND code=@code');
        assert(r.rowsAffected[0] === 1, label + ' cleanup did not delete exactly one record.');
        console.log('PASS: Telemetry test ' + label + ' cleanup');
      } catch (e) { cleanupFailed = true; console.error('CLEANUP FAILED (' + label + '): ' + e.message); }
    }
    if (siteBId && pools[0]) {
      try {
        const r = await pools[0].request()
          .input('id', sql.UniqueIdentifier, siteBId)
          .input('tenant', sql.UniqueIdentifier, tenantA)
          .input('code', sql.NVarChar(128), siteBCode)
          .query('DELETE FROM Telemetry.Sites WHERE id=@id AND tenant_id=@tenant AND code=@code');
        assert(r.rowsAffected[0] === 1, 'Second site cleanup did not delete exactly one record.');
        console.log('PASS: Telemetry second site cleanup');
      } catch (e) { cleanupFailed = true; console.error('CLEANUP FAILED (second site): ' + e.message); }
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
