import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { SqlServerProvider } from "../dist/index.js";
import { SqlServerLicensingTransaction, AuditedLicensingAdministration, SqlServerLicenseRepository } from "../../core/dist/index.js";

test("live licensing audit atomicity", {skip:process.env.RUBY_LICENSING_TEST!=="1",timeout:120000}, async()=>{
 const database=process.env.RUBY_LICENSING_TEST_DATABASE;
 assert.match(database??"",/^RubyLicensingTest_[a-zA-Z0-9_]+$/);
 for(const key of ["SERVER","USER","PASSWORD"]) assert.ok(process.env["RUBY_LICENSING_TEST_"+key],key+" required");
 const create=()=>new SqlServerProvider({server:process.env.RUBY_LICENSING_TEST_SERVER,port:Number(process.env.RUBY_LICENSING_TEST_PORT??"1433"),database,user:process.env.RUBY_LICENSING_TEST_USER,password:process.env.RUBY_LICENSING_TEST_PASSWORD,encrypt:true,trustServerCertificate:false});
 const db=create();
 try {
  await db.connect();
  const check=await db.query("SELECT DB_NAME() AS dbName,(SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped=0) AS tableCount,SCHEMA_ID('core') AS coreSchema");
  assert.equal(check.rows[0].dbName,database);
  assert.equal(check.rows[0].tableCount,0,"Dedicated empty test database required");
  assert.equal(check.rows[0].coreSchema,null);
  await db.execute("CREATE SCHEMA core");
  for(const file of ["002_licenses.sql","003_entitlements.sql","005_entitlement_license_integrity.sql","006_licensing_audit.sql","007_licensing_audit_protection.sql"]) await db.execute(await readFile(new URL("../../core/database/"+file,import.meta.url),"utf8"));
  const tenantId=randomUUID(),actorId=randomUUID(),home=randomUUID(),id=randomUUID();
  const tx=new SqlServerLicensingTransaction(create,{}, {async allows(actor,target){return actor===actorId&&target===tenantId;}});
  const admin=new AuditedLicensingAdministration(tx,{identityId:actorId,tenantId:home});
  const repo=new SqlServerLicenseRepository(db);
  await admin.createLicense(tenantId,{id,tenantId,licenseNumber:"AUDIT-1",type:"TERM",status:"ACTIVE",effectiveFrom:new Date("2026-01-01T00:00:00Z"),effectiveUntil:null});
  assert.equal((await repo.findById(id)).status,"ACTIVE");
  const events=await db.query("SELECT id,actor_id,target_tenant_id,operation FROM core.LicensingAuditEvents");
  assert.equal(events.rows.length,1);
  assert.equal(events.rows[0].actor_id.toLowerCase(),actorId);
  assert.equal(events.rows[0].target_tenant_id.toLowerCase(),tenantId);
  assert.equal(events.rows[0].operation,"create-license");
  await assert.rejects(tx.run(async(a,audit)=>{
   await a.changeStatus(actorId,tenantId,id,"SUSPENDED");
   await audit.append({id:events.rows[0].id,actorId,actorTenantId:home,targetTenantId:tenantId,operation:"change-status",subjectId:id,correlationId:randomUUID(),details:{}});
  }));
  assert.equal((await repo.findById(id)).status,"ACTIVE");
  await assert.rejects(admin.changeStatus(randomUUID(),id,"SUSPENDED"),/forbidden/);
  await assert.rejects(db.execute("UPDATE core.LicensingAuditEvents SET details_json=N'{}'"),/immutable/);
  await assert.rejects(db.execute("DELETE FROM core.LicensingAuditEvents"),/immutable/);
  assert.equal((await db.query("SELECT COUNT(*) AS n FROM core.LicensingAuditEvents")).rows[0].n,1);
  await admin.changeStatus(tenantId,id,"SUSPENDED");
  assert.equal((await repo.findById(id)).status,"SUSPENDED");
  assert.equal((await db.query("SELECT COUNT(*) AS n FROM core.LicensingAuditEvents")).rows[0].n,2);
 } finally {await db.disconnect();}
});
