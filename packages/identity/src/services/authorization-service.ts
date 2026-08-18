import type { AuthorizationDecision, AuthorizationRequest, Permission } from "../types/authorization.js";
import type { PolicyService } from "./policy-service.js";

export interface AuthorizationRepository {
  getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]>;
}

/**
 * Port implemented by the Core CapabilityGuard. Keeping this as a structural
 * contract prevents Identity from depending on a concrete licensing adapter.
 */
export interface CapabilityEntitlementGuard {
  canUse(tenantId: string, capabilityId: string, at?: Date): Promise<boolean>;
}

export class AuthorizationService {
  public constructor(
    private readonly repository: AuthorizationRepository,
    private readonly policyService?: PolicyService,
    private readonly capabilityGuard?: CapabilityEntitlementGuard
  ) {}

  public async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    if (this.capabilityGuard) {
      if (!request.capabilityId) {
        return { allowed: false, reason: "Capability ID required for licensed authorization" };
      }

      const entitled = await this.capabilityGuard.canUse(
        request.context.tenantId,
        request.capabilityId
      );

      if (!entitled) {
        return {
          allowed: false,
          reason: `Capability entitlement denied: ${request.capabilityId}`
        };
      }
    }

    const permissions = await this.repository.getPermissions(
      request.context.identityId,
      request.context.tenantId
    );

    const permittedByRbac = permissions.some(
      (permission) => permission.resource === request.resource && permission.action === request.action
    );

    if (!permittedByRbac) {
      return { allowed: false, reason: "RBAC permission denied" };
    }

    if (this.policyService) {
      return this.policyService.evaluate(request);
    }

    return { allowed: true, reason: "RBAC permission granted" };
  }
}
