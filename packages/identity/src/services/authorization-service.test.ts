import { describe, expect, it, jest } from "@jest/globals";
import { AuthorizationService, type AuthorizationRepository, type CapabilityEntitlementGuard } from "./authorization-service.js";

describe("AuthorizationService", () => {
  const repository: AuthorizationRepository = {
    getPermissions: jest.fn(async (_identityId, tenantId) => tenantId === "tenant-a"
      ? [{ id: "p1", name: "patient.read", resource: "patient", action: "read" }]
      : [])
  };

  const request = {
    capabilityId: "core.compliance",
    resource: "patient",
    action: "read",
    context: {
      identityId: "identity-1",
      tenantId: "tenant-a",
      roles: [],
      attributes: {}
    }
  };

  it("cannot authorize a permission from another tenant", async () => {
    const service = new AuthorizationService(repository);

    await expect(service.authorize(request)).resolves.toMatchObject({ allowed: true });
    await expect(service.authorize({
      ...request,
      context: { ...request.context, tenantId: "tenant-b" }
    })).resolves.toMatchObject({ allowed: false });
  });

  it("denies an authorized request when the tenant is not licensed", async () => {
    const capabilityGuard: CapabilityEntitlementGuard = {
      canUse: jest.fn(async () => false)
    };
    const service = new AuthorizationService(repository, undefined, capabilityGuard);

    await expect(service.authorize(request)).resolves.toMatchObject({
      allowed: false,
      reason: "Capability entitlement denied: core.compliance"
    });
    expect(capabilityGuard.canUse).toHaveBeenCalledWith("tenant-a", "core.compliance");
  });

  it("denies a licensed authorization request when capability context is missing", async () => {
    const capabilityGuard: CapabilityEntitlementGuard = {
      canUse: jest.fn(async () => true)
    };
    const service = new AuthorizationService(repository, undefined, capabilityGuard);

    await expect(service.authorize({
      ...request,
      capabilityId: undefined
    })).resolves.toMatchObject({ allowed: false });
    expect(capabilityGuard.canUse).not.toHaveBeenCalled();
  });

  it("allows a licensed request when entitlement and RBAC both succeed", async () => {
    const capabilityGuard: CapabilityEntitlementGuard = {
      canUse: jest.fn(async () => true)
    };
    const service = new AuthorizationService(repository, undefined, capabilityGuard);

    await expect(service.authorize(request)).resolves.toMatchObject({ allowed: true });
  });
});
