import type { EntitlementRepository } from "./entitlement-repository.js";
import type { Entitlement, EntitlementResolver } from "./types.js";

export class PersistentEntitlementResolver implements EntitlementResolver {
  public constructor(private readonly repository: EntitlementRepository) {}

  public resolve(tenantId: string, capabilityId: string, at = new Date()): Promise<Entitlement | null> {
    return this.repository.findActive(tenantId, capabilityId, at);
  }

  public async isEntitled(tenantId: string, capabilityId: string, at = new Date()): Promise<boolean> {
    return (await this.resolve(tenantId, capabilityId, at)) !== null;
  }
}
