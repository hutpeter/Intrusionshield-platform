import type { Entitlement, EntitlementResolver } from "./types.js";

export class InMemoryEntitlementResolver implements EntitlementResolver {
  public constructor(private readonly entitlements: readonly Entitlement[] = []) {}

  public async resolve(tenantId: string, capabilityId: string, at = new Date()): Promise<Entitlement | null> {
    const candidates = this.entitlements
      .filter((entitlement) => entitlement.tenantId === tenantId)
      .filter((entitlement) => entitlement.capabilityId === capabilityId)
      .filter((entitlement) => entitlement.status === "ACTIVE")
      .filter((entitlement) => entitlement.effectiveFrom <= at)
      .filter((entitlement) => entitlement.effectiveUntil === null || entitlement.effectiveUntil >= at)
      .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());

    return candidates[0] ?? null;
  }

  public async isEntitled(tenantId: string, capabilityId: string, at = new Date()): Promise<boolean> {
    return (await this.resolve(tenantId, capabilityId, at)) !== null;
  }
}
