import { describe, expect, it } from "@jest/globals";
import { InMemoryCapabilityRegistry } from "../capabilities/registry.js";
import { CapabilityGuard } from "./capability-guard.js";
import { InMemoryEntitlementResolver } from "./resolver.js";
import type { Entitlement } from "./types.js";

const base = (
  capabilityId: string,
  overrides: Partial<Entitlement> = {}
): Entitlement => ({
  id: `ent-${capabilityId}`,
  tenantId: "tenant-1",
  capabilityId,
  licenseId: "lic-1",
  status: "ACTIVE",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveUntil: new Date("2027-01-01T00:00:00Z"),
  ...overrides
});

describe("CapabilityGuard", () => {
  it("denies an unknown capability", async () => {
    const registry = new InMemoryCapabilityRegistry();

    const guard = new CapabilityGuard(
      registry,
      new InMemoryEntitlementResolver()
    );

    await expect(
      guard.authorize(
        "tenant-1",
        "core.missing",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual({
      allowed: false,
      capabilityId: "core.missing",
      reason: "Unknown capability"
    });
  });

  it("denies a disabled capability", async () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.disabled",
      name: "Disabled",
      description: "",
      version: "1.0.0",
      category: "test",
      dependencies: [],
      status: "DISABLED"
    });

    const guard = new CapabilityGuard(
      registry,
      new InMemoryEntitlementResolver([base("core.disabled")])
    );

    await expect(
      guard.authorize(
        "tenant-1",
        "core.disabled",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual({
      allowed: false,
      capabilityId: "core.disabled",
      reason: "Capability is disabled"
    });
  });

  it("denies a deprecated capability", async () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.deprecated",
      name: "Deprecated",
      description: "",
      version: "1.0.0",
      category: "test",
      dependencies: [],
      status: "DEPRECATED"
    });

    const guard = new CapabilityGuard(
      registry,
      new InMemoryEntitlementResolver([base("core.deprecated")])
    );

    await expect(
      guard.authorize(
        "tenant-1",
        "core.deprecated",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual({
      allowed: false,
      capabilityId: "core.deprecated",
      reason: "Capability is deprecated"
    });
  });

  it("denies an active capability when the capability itself is not entitled", async () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: [],
      status: "ACTIVE"
    });

    const guard = new CapabilityGuard(
      registry,
      new InMemoryEntitlementResolver()
    );

    await expect(
      guard.authorize(
        "tenant-1",
        "core.ai",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual({
      allowed: false,
      capabilityId: "core.ai",
      reason:
        "Tenant is not entitled to required capability: core.ai"
    });
  });

  it("denies an entitled capability when a dependency is not entitled", async () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.authentication",
      name: "Authentication",
      description: "",
      version: "1.0.0",
      category: "security",
      dependencies: [],
      status: "ACTIVE"
    });

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: ["core.authentication"],
      status: "ACTIVE"
    });

    const guard = new CapabilityGuard(
      registry,
      new InMemoryEntitlementResolver([base("core.ai")])
    );

    await expect(
      guard.authorize(
        "tenant-1",
        "core.ai",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual({
      allowed: false,
      capabilityId: "core.ai",
      reason:
        "Tenant is not entitled to required capability: core.authentication"
    });
  });

  it("allows a capability when the capability and dependencies are entitled", async () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.authentication",
      name: "Authentication",
      description: "",
      version: "1.0.0",
      category: "security",
      dependencies: [],
      status: "ACTIVE"
    });

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: ["core.authentication"],
      status: "ACTIVE"
    });

    const guard = new CapabilityGuard(
      registry,
      new InMemoryEntitlementResolver([
        base("core.authentication"),
        base("core.ai")
      ])
    );

    await expect(
      guard.authorize(
        "tenant-1",
        "core.ai",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual({
      allowed: true,
      capabilityId: "core.ai",
      reason: "Capability entitlement granted"
    });
  });

  it("evaluates entitlement at the requested point in time", async () => {
    const registry = new InMemoryCapabilityRegistry();

    registry.register({
      id: "core.ai",
      name: "AI",
      description: "",
      version: "1.0.0",
      category: "intelligence",
      dependencies: [],
      status: "ACTIVE"
    });

    const guard = new CapabilityGuard(
      registry,
      new InMemoryEntitlementResolver([
        base("core.ai", {
          effectiveUntil: new Date("2026-06-30T23:59:59Z")
        })
      ])
    );

    await expect(
      guard.authorize(
        "tenant-1",
        "core.ai",
        new Date("2026-06-15T00:00:00Z")
      )
    ).resolves.toMatchObject({
      allowed: true
    });

    await expect(
      guard.authorize(
        "tenant-1",
        "core.ai",
        new Date("2026-07-01T00:00:00Z")
      )
    ).resolves.toEqual({
      allowed: false,
      capabilityId: "core.ai",
      reason:
        "Tenant is not entitled to required capability: core.ai"
    });
  });
});