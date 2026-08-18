import { describe, expect, it } from "@jest/globals";
import { InMemoryEntitlementResolver } from "./resolver.js";
import type { Entitlement } from "./types.js";

const entitlement = (overrides: Partial<Entitlement> = {}): Entitlement => ({
  id: "ent-1",
  tenantId: "tenant-1",
  capabilityId: "core.authentication",
  licenseId: "lic-1",
  status: "ACTIVE",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveUntil: new Date("2027-01-01T00:00:00Z"),
  ...overrides
});

describe("InMemoryEntitlementResolver", () => {
  it("accepts an active entitlement in its validity window", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);
    await expect(resolver.isEntitled("tenant-1", "core.authentication", new Date("2026-06-01T00:00:00Z"))).resolves.toBe(true);
  });

  it("rejects expired entitlements", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);
    await expect(resolver.isEntitled("tenant-1", "core.authentication", new Date("2028-01-01T00:00:00Z"))).resolves.toBe(false);
  });

  it("rejects another tenant", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);
    await expect(resolver.isEntitled("tenant-2", "core.authentication")).resolves.toBe(false);
  });
});
