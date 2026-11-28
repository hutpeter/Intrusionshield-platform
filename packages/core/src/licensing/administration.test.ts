import { describe, expect, test, jest } from "@jest/globals";
import { LicensingAdministration } from "./administration.js";
import type { ScopedLicenseRepository, ScopedEntitlementRepository, LicensingAdminAuthorizer } from "./administration.js";
import type { License } from "./types.js";
import type { Entitlement } from "../entitlements/types.js";
import type { CapabilityRegistry } from "../capabilities/types.js";

const license: License = {id:"l1",tenantId:"t1",licenseNumber:"R1",type:"TERM",status:"ACTIVE",effectiveFrom:new Date("2026-01-01"),effectiveUntil:null};
const grant: Entitlement = {id:"e1",tenantId:"t1",licenseId:"l1",capabilityId:"sterile-processing.core",status:"ACTIVE",effectiveFrom:license.effectiveFrom,effectiveUntil:null};
function fixture(allowed=true, stored: License|null=license) {
  const licenses: ScopedLicenseRepository = {
    findById: jest.fn(async () => stored), findActiveForTenant: async () => stored,
    listForTenant: jest.fn(async () => [license]), save: jest.fn(async () => {}),
    setStatus: jest.fn(async () => {}), setStatusForTenant: jest.fn(async () => {})
  };
  const grants: ScopedEntitlementRepository = {
    findActive: async () => grant, listForTenant: jest.fn(async () => [grant]),
    save: jest.fn(async () => {}), revoke: jest.fn(async () => {}), revokeForTenant: jest.fn(async () => {})
  };
  const registry: CapabilityRegistry = {
    register: () => {}, has: () => true, list: () => [], resolveDependencies: () => [],
    get: id => id === grant.capabilityId ? {id,name:"Tiger",description:"",version:"1",category:"application",dependencies:[],status:"ACTIVE"} : undefined
  };
  const authorization: LicensingAdminAuthorizer = {allows: jest.fn(async () => allowed)};
  return {licenses,grants,authorization,admin:new LicensingAdministration(licenses,grants,registry,authorization)};
}
describe("LicensingAdministration", () => {
  test("denies every operation before repository access", async () => {
    const {admin,licenses,grants}=fixture(false);
    for (const action of [() => admin.list("a","t1"), () => admin.createLicense("a","t1",license), () => admin.changeStatus("a","t1","l1","ACTIVE"), () => admin.assign("a","t1",grant), () => admin.revoke("a","t1","e1")]) {
      await expect(action()).rejects.toThrow("forbidden");
    }
    for (const fn of [licenses.listForTenant,licenses.save,licenses.setStatusForTenant,licenses.findById,grants.listForTenant,grants.save,grants.revokeForTenant]) expect(fn).not.toHaveBeenCalled();
  });
  test("lists only the authorized tenant", async () => {
    const {admin,licenses,grants,authorization}=fixture();
    await expect(admin.list("a","t1")).resolves.toEqual({licenses:[license],entitlements:[grant]});
    expect(authorization.allows).toHaveBeenCalledWith("a","t1","read");
    expect(licenses.listForTenant).toHaveBeenCalledWith("t1");
    expect(grants.listForTenant).toHaveBeenCalledWith("t1");
  });
  test("rejects mismatched tenant on creation and assignment", async () => {
    const {admin,licenses,grants}=fixture();
    await expect(admin.createLicense("a","t2",license)).rejects.toThrow("Tenant mismatch");
    await expect(admin.assign("a","t2",grant)).rejects.toThrow("Tenant mismatch");
    expect(licenses.save).not.toHaveBeenCalled();
    expect(grants.save).not.toHaveBeenCalled();
  });
  test("creates a valid license", async () => {
    const {admin,licenses}=fixture();
    await admin.createLicense("a","t1",license);
    expect(licenses.save).toHaveBeenCalledWith(license);
  });
  test("rejects invalid license dates", async () => {
    const {admin}=fixture();
    await expect(admin.createLicense("a","t1",{...license,effectiveFrom:new Date(NaN)})).rejects.toThrow("Invalid license dates");
  });
  test("uses scoped mutations exclusively", async () => {
    const {admin,licenses,grants}=fixture();
    await admin.changeStatus("a","t1","l1","SUSPENDED");
    await admin.revoke("a","t1","e1","test");
    expect(licenses.setStatusForTenant).toHaveBeenCalledWith("t1","l1","SUSPENDED");
    expect(grants.revokeForTenant).toHaveBeenCalledWith("t1","e1","test");
    expect(licenses.setStatus).not.toHaveBeenCalled();
    expect(grants.revoke).not.toHaveBeenCalled();
  });
  test("assigns a registered active capability", async () => {
    const {admin,grants}=fixture();
    await admin.assign("a","t1",grant);
    expect(grants.save).toHaveBeenCalledWith(grant);
  });
  test("rejects unknown capabilities", async () => {
    const {admin,grants}=fixture();
    await expect(admin.assign("a","t1",{...grant,capabilityId:"unknown"})).rejects.toThrow("Invalid entitlement");
    expect(grants.save).not.toHaveBeenCalled();
  });
  test("rejects grants against another tenant's license", async () => {
    const {admin,grants}=fixture(true,{...license,tenantId:"t2"});
    await expect(admin.assign("a","t1",grant)).rejects.toThrow("Eligible tenant license required");
    expect(grants.save).not.toHaveBeenCalled();
  });
  test("rejects grants against revoked licenses", async () => {
    const {admin,grants}=fixture(true,{...license,status:"REVOKED"});
    await expect(admin.assign("a","t1",grant)).rejects.toThrow("Eligible tenant license required");
    expect(grants.save).not.toHaveBeenCalled();
  });
});
