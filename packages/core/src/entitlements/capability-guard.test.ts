import { describe, expect, it } from "@jest/globals";
import { InMemoryCapabilityRegistry } from "../capabilities/registry.js";
import { CapabilityGuard } from "./capability-guard.js";
import { InMemoryEntitlementResolver } from "./resolver.js";
import type { Entitlement } from "./types.js";

const base = (capabilityId: string): Entitlement => ({
  id: `ent-${capabilityId}`,
  tenantId: "tenant-1",
  capabilityId,
  licenseId: "lic-1",
  status: "ACTIVE",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveUntil: new Date("2027-01-01T00:00:00Z")
});

describe("CapabilityGuard", () => {
  it("allows a capability when the capability and dependencies are entitled", async () => {
    const registry = new InMemoryCapabilityRegistry();
    registry.register({ id: "core.authentication", name: "Authentication", description: "", version: "1.0.0", category: "security", dependencies: [], status: "ACTIVE" });
    registry.register({ id: "core.ai", name: "AI", description: "", version: "1.0.0", category: "intelligence", dependencies: ["core.authentication"], status: "ACTIVE" });

    const guard = new CapabilityGuard(registry, new InMemoryEntitlementResolver([base("core.authentication"), base("core.ai")]));
    await expect(guard.authorize("tenant-1", "core.ai")).resolves.toMatchObject({ allowed: true });
  });

  it("denies an entitled capability when a dependency is not entitled", async () => {
    const registry = new InMemoryCapabilityRegistry();
    registry.register({ id: "core.authentication", name: "Authentication", description: "", version: "1.0.0", category: "security", dependencies: [], status: "ACTIVE" });
    registry.register({ id: "core.ai", name: "AI", description: "", version: "1.0.0", category: "intelligence", dependencies: ["core.authentication"], status: "ACTIVE" });

    const guard = new CapabilityGuard(registry, new InMemoryEntitlementResolver([base("core.ai")]));
    await expect(guard.authorize("tenant-1", "core.ai")).resolves.toMatchObject({ allowed: false });
  });
});
