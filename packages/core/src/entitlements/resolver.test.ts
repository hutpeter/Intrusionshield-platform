import { describe, expect, it } from "@jest/globals";
import { InMemoryEntitlementResolver } from "./resolver.js";
import type { Entitlement } from "./types.js";

const entitlement = (
  overrides: Partial<Entitlement> = {}
): Entitlement => ({
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
  it("resolves an active entitlement in its validity window", async () => {
    const expected = entitlement();

    const resolver = new InMemoryEntitlementResolver([expected]);

    await expect(
      resolver.resolve(
        "tenant-1",
        "core.authentication",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual(expected);
  });

  it("accepts an entitlement at its effectiveFrom boundary", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication",
        new Date("2026-01-01T00:00:00Z")
      )
    ).resolves.toBe(true);
  });

  it("accepts an entitlement at its effectiveUntil boundary", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication",
        new Date("2027-01-01T00:00:00Z")
      )
    ).resolves.toBe(true);
  });

  it("rejects an entitlement before its effectiveFrom date", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication",
        new Date("2025-12-31T23:59:59Z")
      )
    ).resolves.toBe(false);
  });

  it("rejects expired entitlements", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication",
        new Date("2027-01-01T00:00:01Z")
      )
    ).resolves.toBe(false);
  });

  it("rejects inactive entitlements", async () => {
    const resolver = new InMemoryEntitlementResolver([
      entitlement({ status: "SUSPENDED" })
    ]);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toBe(false);
  });

  it("rejects another tenant", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);

    await expect(
      resolver.isEntitled(
        "tenant-2",
        "core.authentication",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toBe(false);
  });

  it("rejects another capability", async () => {
    const resolver = new InMemoryEntitlementResolver([entitlement()]);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.ai",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toBe(false);
  });

  it("supports entitlements with no expiration date", async () => {
    const resolver = new InMemoryEntitlementResolver([
      entitlement({ effectiveUntil: null })
    ]);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication",
        new Date("2099-01-01T00:00:00Z")
      )
    ).resolves.toBe(true);
  });

  it("selects the most recently effective matching entitlement", async () => {
    const older = entitlement({
      id: "ent-old",
      effectiveFrom: new Date("2026-01-01T00:00:00Z")
    });

    const newer = entitlement({
      id: "ent-new",
      effectiveFrom: new Date("2026-05-01T00:00:00Z")
    });

    const resolver = new InMemoryEntitlementResolver([older, newer]);

    await expect(
      resolver.resolve(
        "tenant-1",
        "core.authentication",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toEqual(newer);
  });

  it("returns null when no entitlement matches", async () => {
    const resolver = new InMemoryEntitlementResolver();

    await expect(
      resolver.resolve(
        "tenant-1",
        "core.authentication",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toBeNull();
  });

  it("returns false when no entitlement matches", async () => {
    const resolver = new InMemoryEntitlementResolver();

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication",
        new Date("2026-06-01T00:00:00Z")
      )
    ).resolves.toBe(false);
  });
});