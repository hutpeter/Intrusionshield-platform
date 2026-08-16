import type { AuthorizationDecision, AuthorizationRequest, Permission } from "../types/authorization.js";
import type { PolicyService } from "./policy-service.js";

export interface AuthorizationRepository {
  getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]>;
}

export class AuthorizationService {
  public constructor(
    private readonly repository: AuthorizationRepository,
    private readonly policyService?: PolicyService
  ) {}

  public async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
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
