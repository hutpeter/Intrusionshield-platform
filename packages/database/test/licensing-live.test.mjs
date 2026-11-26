import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SqlServerProvider } from "../dist/index.js";
import { SqlServerLicenseRepository, SqlServerEntitlementRepository } from "../../core/dist/index.js";

test("live SQL Server licensing and tenant integrity", {skip: process.env.RUBY_LICENSING_TEST !== "1", timeout: 120000}, async () => {
  const database = process.env.RUBY_LICENSING_TEST_DATABASE;
  assert.match(database ?? "", /^RubyLicensingTest_[a-zA-Z0-9_]+$/);
  for (const key of ["SERVER","USER","PASSWORD"]) assert.ok(process.env["RUBY_LICENSING_TEST_"+key], key+" required");
  const db = new SqlServerProvider({
    server: process.env.RUBY_LICENSING_TEST_SERVER,
    port: Number(process.env.RUBY_LICENSING_TEST_PORT ?? "1433"),
    database, user: process.env.RUBY_LICENSING_TEST_USER,
    password: process.env.RUBY_LICENSING_TEST_PASSWORD,
    encrypt: true, trustServerCertificate: false
  });
  try {
    await db.connect();
    const check = await db.query("SELECT DB_NAME() AS dbName, (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0) AS tableCount, SCHEMA_ID('core') AS coreSchema");
    assert.equal(check.rows[0].dbName, database);
    assert.equal(check.rows[0].tableCount, 0, "Use a dedicated empty test database");
    assert.equal(check.rows[0].coreSchema, null, "Test database must not contain core schema");
    await db.execute("CREATE SCHEMA core");
    for (const file of ["002_licenses.sql","003_entitlements.sql","005_entitlement_license_integrity.sql"]) {
      await db.execute(await readFile(new URL("../../core/database/"+file, import.meta.url), "utf8"));
    }
    const licenses = new SqlServerLicenseRepository(db);
    const grants = new SqlServerEntitlementRepository(db);
    const tenantId = randomUUID(), other = randomUUID(), id = randomUUID();
    const at = new Date("2026-11-26T12:00:00Z");
    const license = {id, tenantId, licenseNumber:"TEST-1", type:"TERM", status:"ACTIVE", effectiveFrom:new Date("2026-11-01T00:00:00Z"), effectiveUntil:new Date("2026-12-01T00:00:00Z")};
    const grant = {id:randomUUID(), tenantId, licenseId:id, capabilityId:"sterile-processing.core", status:"ACTIVE", effectiveFrom:license.effectiveFrom, effectiveUntil:null, limits:{maxUsers:10}};
    await licenses.save(license);
    await grants.save(grant);
    assert.deepEqual(await licenses.findById(id), license);
    assert.deepEqual(await grants.findActive(tenantId,grant.capabilityId,at), grant);
    assert.equal(await grants.findActive(other,grant.capabilityId,at), null);
    assert.equal(await grants.findActive(tenantId,grant.capabilityId,new Date("2026-12-02T00:00:00Z")), null);
    await assert.rejects(grants.save({...grant,id:randomUUID(),tenantId:other}), /FK_Entitlements_TenantLicense/);
    await assert.rejects(licenses.setStatusForTenant(other,id,"SUSPENDED"), /not found/);
    await assert.rejects(grants.revokeForTenant(other,grant.id), /not found/);
    await licenses.setStatusForTenant(tenantId,id,"SUSPENDED");
    assert.equal(await grants.findActive(tenantId,grant.capabilityId,at), null);
    await licenses.setStatusForTenant(tenantId,id,"ACTIVE");
    assert.ok(await grants.findActive(tenantId,grant.capabilityId,at));
    await grants.revokeForTenant(tenantId,grant.id,"test");
    assert.equal(await grants.findActive(tenantId,grant.capabilityId,at), null);
    await licenses.setStatusForTenant(tenantId,id,"REVOKED");
    await assert.rejects(licenses.setStatusForTenant(tenantId,id,"ACTIVE"), /revoked/);
  } finally {
    await db.disconnect();
  }
});
