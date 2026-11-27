import { describe, expect, test, jest } from "@jest/globals";
import { RbacLicensingAuthorizer } from "./rbac-authorizer.js";
import type { LicensingAdminOperation } from "./administration.js";

function fixture(allowed = true) {
  const authorize = jest.fn(async () => ({allowed}));
  return {authorize, adapter: new RbacLicensingAuthorizer({authorize}, {identityId:"a1",tenantId:"t1"})};
}
describe("RbacLicensingAuthorizer", () => {
  test("checks each administrative action through Ruby RBAC", async () => {
    const {adapter,authorize}=fixture();
    const operations: LicensingAdminOperation[] = ["read","create-license","change-status","assign-entitlement","revoke-entitlement"];
    for (const action of operations) {
      await expect(adapter.allows("a1","t1",action)).resolves.toBe(true);
      expect(authorize).toHaveBeenLastCalledWith({resource:"licensing.administration",action,context:{identityId:"a1",tenantId:"t1",roles:[],attributes:{}}});
    }
  });
  test("denies a user without permission", async () => {
    const {adapter}=fixture(false);
    await expect(adapter.allows("a1","t1","read")).resolves.toBe(false);
  });
  test("rejects another tenant before RBAC lookup", async () => {
    const {adapter,authorize}=fixture();
    await expect(adapter.allows("a1","t2","read")).resolves.toBe(false);
    expect(authorize).not.toHaveBeenCalled();
  });
  test("rejects substituted actor identity", async () => {
    const {adapter,authorize}=fixture();
    await expect(adapter.allows("a2","t1","read")).resolves.toBe(false);
    expect(authorize).not.toHaveBeenCalled();
  });
  test("rejects missing identity or tenant", async () => {
    const {adapter,authorize}=fixture();
    await expect(adapter.allows("","t1","read")).resolves.toBe(false);
    await expect(adapter.allows("a1","","read")).resolves.toBe(false);
    expect(authorize).not.toHaveBeenCalled();
  });
  test("propagates authorization failure without granting access", async () => {
    const {adapter,authorize}=fixture();
    authorize.mockRejectedValueOnce(new Error("Authorization unavailable"));
    await expect(adapter.allows("a1","t1","read")).rejects.toThrow("Authorization unavailable");
  });
});
