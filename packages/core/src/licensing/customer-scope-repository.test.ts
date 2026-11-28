import { describe,expect,test } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { SqlServerLicensingCustomerScopeRepository } from "./customer-scope-repository.js";
function fixture(count=1){
 const calls:unknown[][]=[];
 const repo=new SqlServerLicensingCustomerScopeRepository({async execute(sql,params){calls.push([sql,params]);return count;}});
 const scope={id:randomUUID(),identityId:randomUUID(),homeTenantId:randomUUID(),customerTenantId:randomUUID(),effectiveFrom:new Date(0),effectiveUntil:null};
 return {repo,calls,scope};
}
describe("customer scope persistence",()=>{
 test("binds assignment to active identity and home tenant",async()=>{
  const f=fixture();await f.repo.assign(f.scope);
  expect(f.calls[0]?.[0]).toContain("Id=@identityId AND TenantId=@homeTenantId AND Status=N'ACTIVE'");
  expect(f.calls[0]?.[1]).toEqual(Object.entries(f.scope).map(([name,value])=>({name,value})));
 });
 test("rejects invalid identifiers and dates before SQL",async()=>{
  const f=fixture();
  await expect(f.repo.assign({...f.scope,id:"bad"})).rejects.toThrow("Invalid scope identifiers");
  await expect(f.repo.assign({...f.scope,effectiveUntil:new Date(0)})).rejects.toThrow("Invalid scope window");
  expect(f.calls).toEqual([]);
 });
 test("revokes only exact identity, home and customer scope",async()=>{
  const f=fixture(),s=f.scope;await f.repo.revoke(s.id,s.homeTenantId,s.identityId,s.customerTenantId);
  expect(f.calls[0]?.[0]).toContain("HomeTenantId=@homeTenantId AND IdentityId=@identityId AND CustomerTenantId=@customerTenantId AND RevokedAt IS NULL");
 });
 test("rejects unsuccessful assignment and revocation",async()=>{
  const f=fixture(0),s=f.scope;
  await expect(f.repo.assign(s)).rejects.toThrow("assignment failed");
  await expect(f.repo.revoke(s.id,s.homeTenantId,s.identityId,s.customerTenantId)).rejects.toThrow("not found or revoked");
 });
});
