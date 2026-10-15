import type { CapabilityRegistry } from "../capabilities/types.js";
import type { EntitlementResolver } from "./types.js";

export interface CapabilityAccessDecision {
  readonly allowed: boolean;
  readonly capabilityId: string;
  readonly reason: string;
}

export class CapabilityGuard {
  public constructor(
    private readonly registry: CapabilityRegistry,
    private readonly entitlements: EntitlementResolver
  ) {}

  public async authorize(tenantId: string, capabilityId: string, at = new Date()): Promise<CapabilityAccessDecision> {
    const capability = this.registry.get(capabilityId);
    if (!capability) {
      return { allowed: false, capabilityId, reason: "Unknown capability" };
    }

    if (capability.status !== "ACTIVE") {
      return { allowed: false, capabilityId, reason: `Capability is ${capability.status.toLowerCase()}` };
    }

    const chain = [...this.registry.resolveDependencies(capabilityId), capability];
    for (const required of chain) {
      if (!(await this.entitlements.isEntitled(tenantId, required.id, at))) {
        return {
          allowed: false,
          capabilityId,
          reason: `Tenant is not entitled to required capability: ${required.id}`
        };
      }
    }

    return { allowed: true, capabilityId, reason: "Capability entitlement granted" };
  }
}
