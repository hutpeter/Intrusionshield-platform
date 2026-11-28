import { describe, expect, test } from "@jest/globals";
import { SqlServerPlatformLicensingPolicy } from "./sql-server-platform-policy.js";
function fixture(allowed: number | undefined = 1) {
  const calls: {sql:string; parameters:{name:string;value:unknown}[]}[]=[];
  const policy=new SqlServerPlatformLicensingPolicy({
    async query<T>(sql:string,parameters:{name:string;value:unknown}[]) {
      calls.push({sql,parameters});
      return {rows:allowed===undefined?[]:[{allowed} as T]};
    }
  });
  return {policy,calls};
}
describe("SqlServerPlatformLicensingPolicy",()=>{
  test("binds home identity and exact platform permission",async()=>{
    const {policy,calls}=fixture();
    await expect(policy.hasPlatformPermission("actor","home","platform.licensing","READ")).resolves.toBe(true);
    expect(calls[0]?.parameters).toEqual([
      {name:"identityId",value:"actor"},{name:"homeTenantId",value:"home"},
      {name:"resource",value:"platform.licensing"},{name:"action",value:"READ"}
    ]);
    expect(calls[0]?.sql).toContain("a.Scope=N'PLATFORM'");
    expect(calls[0]?.sql).toContain("r.TenantId IS NULL");
    expect(calls[0]?.sql).toContain("rp.Scope=N'PLATFORM'");
    expect(calls[0]?.sql).toContain("p.Scope=N'PLATFORM'");
    expect(calls[0]?.sql).toContain("i.Status=N'ACTIVE'");
  });
  test("rejects unrelated resources and actions without SQL",async()=>{
    const {policy,calls}=fixture();
    await expect(policy.hasPlatformPermission("actor","home","platform.tenants","READ")).resolves.toBe(false);
    await expect(policy.hasPlatformPermission("actor","home","platform.licensing","DELETE")).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });
  test("binds explicit customer scope and requires current unrevoked assignment",async()=>{
    const {policy,calls}=fixture();
    await expect(policy.canManageCustomer("actor","home","customer")).resolves.toBe(true);
    expect(calls[0]?.parameters).toEqual([
      {name:"identityId",value:"actor"},{name:"homeTenantId",value:"home"},{name:"customerTenantId",value:"customer"}
    ]);
    expect(calls[0]?.sql).toContain("[Platform].[Tenants]");
    expect(calls[0]?.sql).toContain("s.RevokedAt IS NULL");
    expect(calls[0]?.sql).toContain("s.EffectiveFrom<=SYSUTCDATETIME()");
    expect(calls[0]?.sql).toContain("s.EffectiveUntil>SYSUTCDATETIME()");
    expect(calls[0]?.sql).toContain("i.Status=N'ACTIVE'");
  });
  test("denies zero results and explicit negative decisions",async()=>{
    for(const value of [0,2]){
      const {policy}=fixture(value);
      await expect(policy.hasPlatformPermission("actor","home","platform.licensing","READ")).resolves.toBe(false);
      await expect(policy.canManageCustomer("actor","home","customer")).resolves.toBe(false);
    }
    const policy=new SqlServerPlatformLicensingPolicy({async query<T>(){return {rows:[] as T[]};}});
    await expect(policy.hasPlatformPermission("actor","home","platform.licensing","READ")).resolves.toBe(false);
    await expect(policy.canManageCustomer("actor","home","customer")).resolves.toBe(false);
  });
});
