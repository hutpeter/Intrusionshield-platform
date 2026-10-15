import { describe, expect, it, jest } from "@jest/globals";
import { PersistentEntitlementResolver } from "./persistent-resolver.js";
import type { Entitlement } from "./types.js";
import type { EntitlementRepository } from "./entitlement-repository.js";

const entitlement: Entitlement = {
  id: "ent-1",
  tenantId: "tenant-1",
  capabilityId: "core.authentication",
  licenseId: "lic-1",
  status: "ACTIVE",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveUntil: new Date("2027-01-01T00:00:00Z")
};

describe("PersistentEntitlementResolver", () => {
  it("delegates resolve to the repository", async () => {
    const at = new Date("2026-06-01T00:00:00Z");
    const findActive = jest.fn<EntitlementRepository["findActive"]>()
      .mockResolvedValue(entitlement);

    const repository: EntitlementRepository = {
      findActive,
      listForTenant: jest.fn(),
      save: jest.fn(),
      revoke: jest.fn()
    };

    const resolver = new PersistentEntitlementResolver(repository);

    await expect(
      resolver.resolve(
        "tenant-1",
        "core.authentication",
        at
      )
    ).resolves.toBe(entitlement);

    expect(findActive).toHaveBeenCalledWith(
      "tenant-1",
      "core.authentication",
      at
    );
    expect(findActive).toHaveBeenCalledTimes(1);
  });

  it("returns true when an entitlement exists", async () => {
    const repository: EntitlementRepository = {
      findActive: jest.fn().mockResolvedValue(entitlement),
      listForTenant: jest.fn(),
      save: jest.fn(),
      revoke: jest.fn()
    };

    const resolver = new PersistentEntitlementResolver(repository);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication"
      )
    ).resolves.toBe(true);
  });

  it("returns false when no entitlement exists", async () => {
    const repository: EntitlementRepository = {
      findActive: jest.fn().mockResolvedValue(null),
      listForTenant: jest.fn(),
      save: jest.fn(),
      revoke: jest.fn()
    };

    const resolver = new PersistentEntitlementResolver(repository);

    await expect(
      resolver.isEntitled(
        "tenant-1",
        "core.authentication"
      )
    ).resolves.toBe(false);
  });
});