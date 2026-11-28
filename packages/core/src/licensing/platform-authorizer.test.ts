import { describe, expect, test, jest } from "@jest/globals";
import { PlatformLicensingAuthorizer } from "./platform-authorizer.js";
import type { LicensingAdminOperation } from "./administration.js";

const actor="10000000-0000-4000-8000-000000000001";
const home="20000000-0000-4000-8000-000000000001";
const customer="30000000-0000-4000-8000-000000000001";
function fixture(permission=true, scope=true) {
  const hasPlatformPermission=jest.fn(async()=>permission);
  const canManageCustomer=jest.fn(async()=>scope);
  const session={identityId:actor,tenantId:home};
  const adapter=new PlatformLicensingAuthorizer({hasPlatformPermission,canManageCustomer},session);
  return {adapter,hasPlatformPermission,canManageCustomer,session};
}
describe("PlatformLicensingAuthorizer",()=>{
  test("maps every operation to a platform permission and checks customer scope",async()=>{
    const f=fixture();
    const operations: [LicensingAdminOperation,string][]=[
      ["read","READ"],["create-license","CREATE_LICENSE"],["change-status","CHANGE_STATUS"],
      ["assign-entitlement","ASSIGN_ENTITLEMENT"],["revoke-entitlement","REVOKE_ENTITLEMENT"]
    ];
    for(const [operation,action] of operations){
      await expect(f.adapter.allows(actor,customer,operation)).resolves.toBe(true);
      expect(f.hasPlatformPermission).toHaveBeenLastCalledWith(actor,home,"platform.licensing",action);
      expect(f.canManageCustomer).toHaveBeenLastCalledWith(actor,home,customer);
    }
  });
  test("denies missing platform permission before checking customer scope",async()=>{
    const f=fixture(false);
    await expect(f.adapter.allows(actor,customer,"read")).resolves.toBe(false);
    expect(f.canManageCustomer).not.toHaveBeenCalled();
  });
  test("denies customer outside delegated scope",async()=>{
    const f=fixture(true,false);
    await expect(f.adapter.allows(actor,customer,"read")).resolves.toBe(false);
  });
  test("rejects substituted actor, invalid target and unknown action",async()=>{
    const f=fixture();
    await expect(f.adapter.allows(customer,customer,"read")).resolves.toBe(false);
    await expect(f.adapter.allows(actor,"invalid","read")).resolves.toBe(false);
    await expect(f.adapter.allows(actor,customer,"toString" as LicensingAdminOperation)).resolves.toBe(false);
    expect(f.hasPlatformPermission).not.toHaveBeenCalled();
  });
  test("does not allow mutation of the original session to change actor binding",async()=>{
    const f=fixture();
    f.session.identityId=customer;
    f.session.tenantId=customer;
    await expect(f.adapter.allows(customer,customer,"read")).resolves.toBe(false);
    await expect(f.adapter.allows(actor,customer,"read")).resolves.toBe(true);
    expect(f.hasPlatformPermission).toHaveBeenLastCalledWith(actor,home,"platform.licensing","READ");
  });
  test("fails closed when platform permission lookup fails",async()=>{
    const f=fixture();
    f.hasPlatformPermission.mockRejectedValueOnce(new Error("permission unavailable"));
    await expect(f.adapter.allows(actor,customer,"read")).rejects.toThrow("permission unavailable");
    expect(f.canManageCustomer).not.toHaveBeenCalled();
  });
  test("fails closed when customer scope lookup fails",async()=>{
    const f=fixture();
    f.canManageCustomer.mockRejectedValueOnce(new Error("scope unavailable"));
    await expect(f.adapter.allows(actor,customer,"read")).rejects.toThrow("scope unavailable");
  });
});
