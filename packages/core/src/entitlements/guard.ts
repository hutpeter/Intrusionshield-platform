import type { CapabilityRegistry } from "../capabilities/types.js";
import type { EntitlementResolver } from "./types.js";

export class CapabilityGuard {
  public constructor(
    private readonly registry: CapabilityRegistry,
    private readonly entitlements: EntitlementResolver
  ) {}

  public async assertEntitled(tenantId: string, capabilityId: string, at = new Date()): Promise<void> {
    if (!this.registry.has(capabilityId)) {
      throw new Error(`Unknown capability: ${capabilityId}`);
    }

    if (!(await this.entitlements.isEntitled(tenantId, capabilityId, at))) {
      throw new Error(`Capability not entitled for tenant: ${capabilityId}`);
    }

    for (const dependency of this.registry.resolveDependencies(capabilityId)) {
      if (!(await this.entitlements.isEntitled(tenantId, dependency.id, at))) {
        throw new Error(`Capability dependency not entitled for tenant: ${dependency.id}`);
      }
    }
  }

  public async canUse(tenantId: string, capabilityId: string, at = new Date()): Promise<boolean> {
    try {
      await this.assertEntitled(tenantId, capabilityId, at);
      return true;
    } catch {
      return false;
    }
  }
}
