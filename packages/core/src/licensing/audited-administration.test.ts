import { describe, expect, test } from "@jest/globals";
import { AuditedLicensingAdministration } from "./audited-administration.js";
import type { LicensingTransaction } from "./audited-administration.js";
import type { LicensingAdministration } from "./administration.js";
import type { LicensingAuditEvent } from "./audit.js";
import type { License } from "./types.js";
import type { Entitlement } from "../entitlements/types.js";

function fixture(fail=false){
  const calls:unknown[][]=[];
  const events:LicensingAuditEvent[]=[];
  const record=async(...args:unknown[])=>{calls.push(args);if(fail)throw new Error("denied");};
  const admin={createLicense:(...args:unknown[])=>record("create",...args),changeStatus:(...args:unknown[])=>record("status",...args),assign:(...args:unknown[])=>record("assign",...args),revoke:(...args:unknown[])=>record("revoke",...args)} as unknown as LicensingAdministration;
  const tx:LicensingTransaction={async run(work){return work(admin,{async append(event){events.push(event);}});}};
  const session={identityId:"actor",tenantId:"home"};
  const facade=new AuditedLicensingAdministration(tx,session);
  session.identityId="changed";session.tenantId="changed";
  return {facade,calls,events};
}
describe("AuditedLicensingAdministration",()=>{
  test("maps all mutations and snapshots trusted actor",async()=>{
    const f=fixture();
    const license:License={id:"l",tenantId:"customer",licenseNumber:"L",type:"TERM",status:"ACTIVE",effectiveFrom:new Date(0),effectiveUntil:null};
    const grant:Entitlement={id:"e",tenantId:"customer",licenseId:"l",capabilityId:"tiger",status:"ACTIVE",effectiveFrom:new Date(0),effectiveUntil:null};
    await f.facade.createLicense("customer",license);
    await f.facade.changeStatus("customer","l","SUSPENDED");
    await f.facade.assign("customer",grant);
    await f.facade.revoke("customer","e","private reason");
    expect(f.calls).toEqual([["create","actor","customer",license],["status","actor","customer","l","SUSPENDED"],["assign","actor","customer",grant],["revoke","actor","customer","e","private reason"]]);
    expect(f.events.map(e=>[e.operation,e.subjectId,e.details])).toEqual([["create-license","l",{type:"TERM",status:"ACTIVE"}],["change-status","l",{status:"SUSPENDED"}],["assign-entitlement","e",{licenseId:"l",capabilityId:"tiger"}],["revoke-entitlement","e",{reasonProvided:true}]]);
    for(const event of f.events)expect(event).toMatchObject({actorId:"actor",actorTenantId:"home",targetTenantId:"customer"});
    expect(new Set(f.events.map(e=>e.id)).size).toBe(4);
    expect(new Set(f.events.map(e=>e.correlationId)).size).toBe(4);
  });
  test("does not audit a rejected mutation as successful",async()=>{
    const f=fixture(true);
    await expect(f.facade.changeStatus("customer","l","ACTIVE")).rejects.toThrow("denied");
    expect(f.events).toEqual([]);
  });
});
