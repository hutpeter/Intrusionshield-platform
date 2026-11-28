import type { CapabilityRegistry } from "../capabilities/types.js";
import type { EntitlementResolver } from "../entitlements/types.js";
import type { LicenseService } from "./types.js";

export interface LicensingAccessDecision {
  readonly allowed: boolean;
  readonly reason?: "UNKNOWN_CAPABILITY" | "CAPABILITY_INACTIVE" | "DEPENDENCY_INACTIVE" | "LICENSE_INACTIVE" | "CAPABILITY_NOT_ENTITLED" | "DEPENDENCY_NOT_ENTITLED";
  readonly capabilityId: string;
}

export class LicensingAccessService {
  public constructor(
    private readonly licenses: LicenseService,
    private readonly registry: CapabilityRegistry,
    private readonly entitlements: EntitlementResolver
  ) {}

  public async canUse(
    tenantId: string,
    capabilityId: string,
    at = new Date()
  ): Promise<LicensingAccessDecision> {
    const capability = this.registry.get(capabilityId);
    if (!capability) {
      return {
        allowed: false,
        reason: "UNKNOWN_CAPABILITY",
        capabilityId
      };
    }

    if (capability.status !== "ACTIVE") {
      return { allowed: false, reason: "CAPABILITY_INACTIVE", capabilityId };
    }

    if (!(await this.licenses.isActive(tenantId, at))) {
      return {
        allowed: false,
        reason: "LICENSE_INACTIVE",
        capabilityId
      };
    }

    if (!(await this.entitlements.isEntitled(tenantId, capabilityId, at))) {
      return {
        allowed: false,
        reason: "CAPABILITY_NOT_ENTITLED",
        capabilityId
      };
    }

    for (const dependency of this.registry.resolveDependencies(capabilityId)) {
      if (dependency.status !== "ACTIVE") {
        return { allowed: false, reason: "DEPENDENCY_INACTIVE", capabilityId };
      }
      if (!(await this.entitlements.isEntitled(tenantId, dependency.id, at))) {
        return {
          allowed: false,
          reason: "DEPENDENCY_NOT_ENTITLED",
          capabilityId
        };
      }
    }

    return {
      allowed: true,
      capabilityId
    };
  }
}