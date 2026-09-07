import { describe, expect, jest, test } from "@jest/globals";
import { InMemoryCapabilityRegistry } from "../capabilities/registry.js";
import type { CapabilityDefinition, CapabilityRegistry } from "../capabilities/types.js";
import type { EntitlementResolver } from "../entitlements/types.js";
import { LicensingAccessService } from "./access-service.js";
import type { LicenseService } from "./types.js";

const tenantId = "tenant-1";
const capabilityId = "core.ai";
const at = new Date("2026-06-01T00:00:00Z");

const authentication: CapabilityDefinition = {
  id: "core.authentication",
  name: "Authentication",
  description: "Authentication capabilities.",
  version: "1.0.0",
  category: "security",
  dependencies: [],
  status: "ACTIVE"
};

const ai: CapabilityDefinition = {
  id: capabilityId,
  name: "AI Hub",
  description: "AI routing and orchestration capabilities.",
  version: "1.0.0",
  category: "intelligence",
  dependencies: ["core.authentication"],
  status: "ACTIVE"
};

const createRegistry = (): CapabilityRegistry => {
  const registry = new InMemoryCapabilityRegistry();
  registry.register(authentication);
  registry.register(ai);
  return registry;
};

const createLicenseService = (active: boolean): LicenseService => ({
  get: jest.fn(),
  listForTenant: jest.fn(),
  create: jest.fn(),
  setStatus: jest.fn(),
  isActive: jest.fn().mockResolvedValue(active)
});

const createEntitlementResolver = (
  entitledCapabilityIds: readonly string[]
): EntitlementResolver => ({
  resolve: jest.fn(),
  isEntitled: jest.fn(async (_tenantId, requiredCapabilityId) =>
    entitledCapabilityIds.includes(requiredCapabilityId)
  )
});

describe("LicensingAccessService", () => {
  test("denies an unknown capability", async () => {
    const licenses = createLicenseService(true);
    const entitlements = createEntitlementResolver([]);
    const service = new LicensingAccessService(
      licenses,
      createRegistry(),
      entitlements
    );

    await expect(
      service.canUse(tenantId, "core.unknown", at)
    ).resolves.toEqual({
      allowed: false,
      reason: "UNKNOWN_CAPABILITY",
      capabilityId: "core.unknown"
    });

    expect(licenses.isActive).not.toHaveBeenCalled();
    expect(entitlements.isEntitled).not.toHaveBeenCalled();
  });

  test("denies a capability when the tenant license is inactive", async () => {
    const licenses = createLicenseService(false);
    const entitlements = createEntitlementResolver([]);
    const service = new LicensingAccessService(
      licenses,
      createRegistry(),
      entitlements
    );

    await expect(
      service.canUse(tenantId, capabilityId, at)
    ).resolves.toEqual({
      allowed: false,
      reason: "LICENSE_INACTIVE",
      capabilityId
    });

    expect(licenses.isActive).toHaveBeenCalledWith(tenantId, at);
    expect(entitlements.isEntitled).not.toHaveBeenCalled();
  });

  test("denies a capability when the tenant is not entitled to it", async () => {
    const licenses = createLicenseService(true);
    const entitlements = createEntitlementResolver([]);
    const service = new LicensingAccessService(
      licenses,
      createRegistry(),
      entitlements
    );

    await expect(
      service.canUse(tenantId, capabilityId, at)
    ).resolves.toEqual({
      allowed: false,
      reason: "CAPABILITY_NOT_ENTITLED",
      capabilityId
    });

    expect(licenses.isActive).toHaveBeenCalledWith(tenantId, at);
    expect(entitlements.isEntitled).toHaveBeenCalledWith(
      tenantId,
      capabilityId,
      at
    );
    expect(entitlements.isEntitled).toHaveBeenCalledTimes(1);
  });

  test("denies a capability when a required dependency is not entitled", async () => {
    const licenses = createLicenseService(true);
    const entitlements = createEntitlementResolver([capabilityId]);
    const service = new LicensingAccessService(
      licenses,
      createRegistry(),
      entitlements
    );

    await expect(
      service.canUse(tenantId, capabilityId, at)
    ).resolves.toEqual({
      allowed: false,
      reason: "DEPENDENCY_NOT_ENTITLED",
      capabilityId
    });

    expect(entitlements.isEntitled).toHaveBeenCalledWith(
      tenantId,
      capabilityId,
      at
    );
    expect(entitlements.isEntitled).toHaveBeenCalledWith(
      tenantId,
      "core.authentication",
      at
    );
    expect(entitlements.isEntitled).toHaveBeenCalledTimes(2);
  });

  test("allows a capability when the license, capability, and dependencies are entitled", async () => {
    const licenses = createLicenseService(true);
    const entitlements = createEntitlementResolver([
      capabilityId,
      "core.authentication"
    ]);
    const service = new LicensingAccessService(
      licenses,
      createRegistry(),
      entitlements
    );

    await expect(
      service.canUse(tenantId, capabilityId, at)
    ).resolves.toEqual({
      allowed: true,
      capabilityId
    });

    expect(licenses.isActive).toHaveBeenCalledWith(tenantId, at);
    expect(entitlements.isEntitled).toHaveBeenCalledWith(
      tenantId,
      capabilityId,
      at
    );
    expect(entitlements.isEntitled).toHaveBeenCalledWith(
      tenantId,
      "core.authentication",
      at
    );
    expect(entitlements.isEntitled).toHaveBeenCalledTimes(2);
  });
});