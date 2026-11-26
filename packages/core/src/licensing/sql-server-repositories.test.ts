import { describe, expect, test } from "@jest/globals";
import { SqlServerLicenseRepository, SqlServerEntitlementRepository, type LicensingSqlExecutor } from "./sql-server-repositories.js";
import type { License } from "./types.js";
import type { Entitlement } from "../entitlements/types.js";

const at = new Date("2026-11-26T00:00:00Z");
const license: License = {id:"l1",tenantId:"t1",licenseNumber:"R-1",type:"TERM",status:"ACTIVE",effectiveFrom:at,effectiveUntil:null,metadata:{product:"Tiger"}};
const grant: Entitlement = {id:"e1",tenantId:"t1",licenseId:"l1",capabilityId:"sterile-processing.core",status:"ACTIVE",effectiveFrom:at,effectiveUntil:null,limits:{maxUsers:10}};
function fixture(rows: unknown[] = [], affected = 1) {
  const calls: {sql:string; parameters:{name:string;value:unknown}[]}[] = [];
  const db: LicensingSqlExecutor = {
    async query<T>(sql:string, parameters:{name:string;value:unknown}[]) {
      calls.push({sql,parameters}); return {rows:rows as T[]};
    },
    async execute(sql,parameters) {calls.push({sql,parameters});return affected;}
  };
  return {db,calls};
}
describe("SQL Server licensing repositories", () => {
  test("maps persisted license metadata and dates", async () => {
    const {metadata,...fields}=license;
    const {db,calls}=fixture([{...fields,metadataJson:JSON.stringify(metadata)}]);
    expect(await new SqlServerLicenseRepository(db).findById("l1")).toEqual(license);
    expect(calls[0]?.parameters).toEqual([{name:"id",value:"l1"}]);
  });
  test("queries active licenses within tenant and validity window", async () => {
    const {db,calls}=fixture();
    expect(await new SqlServerLicenseRepository(db).findActiveForTenant("t1",at)).toBeNull();
    expect(calls[0]?.sql).toContain("tenant_id=@tenantId AND status='ACTIVE'");
    expect(calls[0]?.sql).toContain("effective_until>=@at");
  });
  test("inserts license metadata using parameters", async () => {
    const {db,calls}=fixture();
    await new SqlServerLicenseRepository(db).save(license);
    expect(calls[0]?.parameters).toContainEqual({name:"metadataJson",value:JSON.stringify(license.metadata)});
  });
  test("rejects status update for missing license", async () => {
    const {db}=fixture([],0);
    await expect(new SqlServerLicenseRepository(db).setStatus("missing","REVOKED")).rejects.toThrow("License not found");
  });
  test("joins each grant to its own tenant-bound active license before selection", async () => {
    const {db,calls}=fixture();
    expect(await new SqlServerEntitlementRepository(db).findActive("t1",grant.capabilityId,at)).toBeNull();
    const sql=calls[0]?.sql;
    expect(sql).toContain("l.id=e.license_id AND l.tenant_id=e.tenant_id");
    expect(sql).toContain("e.tenant_id=@tenantId AND e.capability_id=@capabilityId");
    expect(sql).toContain("e.status='ACTIVE' AND l.status='ACTIVE'");
    for(const alias of ["e","l"]) {
      expect(sql).toContain(alias+".effective_from<=@at");
      expect(sql).toContain(alias+".effective_until>=@at");
    }
    expect(calls[0]?.parameters).toEqual([{name:"tenantId",value:"t1"},{name:"capabilityId",value:grant.capabilityId},{name:"at",value:at}]);
  });
  test("maps entitlement limits", async () => {
    const {limits,...fields}=grant;
    const {db}=fixture([{...fields,limitsJson:JSON.stringify(limits),metadataJson:null}]);
    expect(await new SqlServerEntitlementRepository(db).listForTenant("t1")).toEqual([grant]);
  });
  test("inserts grant with associated license and limits", async () => {
    const {db,calls}=fixture();
    await new SqlServerEntitlementRepository(db).save(grant);
    expect(calls[0]?.parameters).toContainEqual({name:"licenseId",value:"l1"});
    expect(calls[0]?.parameters).toContainEqual({name:"limitsJson",value:JSON.stringify(grant.limits)});
  });
  test("parameterizes revocation reason", async () => {
    const {db,calls}=fixture();
    await new SqlServerEntitlementRepository(db).revoke("e1","contract ended");
    expect(calls[0]?.parameters).toContainEqual({name:"reason",value:"contract ended"});
    expect(calls[0]?.sql).toContain("status='REVOKED'");
  });
});

describe("Tenant-scoped licensing mutations", () => {
  test("scopes status updates and excludes revoked licenses", async () => {
    const {db,calls}=fixture();
    await new SqlServerLicenseRepository(db).setStatusForTenant("t1","l1","SUSPENDED");
    expect(calls[0]?.sql).toContain("WHERE tenant_id=@tenantId AND id=@id AND status<>'REVOKED'");
    expect(calls[0]?.parameters).toEqual([{name:"tenantId",value:"t1"},{name:"id",value:"l1"},{name:"status",value:"SUSPENDED"}]);
  });
  test("rejects status updates when no eligible tenant license matches", async () => {
    const {db}=fixture([],0);
    await expect(new SqlServerLicenseRepository(db).setStatusForTenant("t2","l1","ACTIVE")).rejects.toThrow("License not found or revoked");
  });
  test("scopes entitlement revocation and handles absent reason", async () => {
    const {db,calls}=fixture();
    await new SqlServerEntitlementRepository(db).revokeForTenant("t1","e1");
    expect(calls[0]?.sql).toContain("WHERE tenant_id=@tenantId AND id=@entitlementId AND status<>'REVOKED'");
    expect(calls[0]?.parameters).toEqual([{name:"tenantId",value:"t1"},{name:"entitlementId",value:"e1"},{name:"reason",value:null}]);
  });
  test("rejects revocation when no eligible tenant grant matches", async () => {
    const {db}=fixture([],0);
    await expect(new SqlServerEntitlementRepository(db).revokeForTenant("t2","e1")).rejects.toThrow("Entitlement not found or already revoked");
  });
});
