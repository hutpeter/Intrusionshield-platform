import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Permission
} from "../types/authorization.js";

export interface AuthorizationRepository {
  getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]>;
}

export class AuthorizationService {
  public constructor(private readonly repository: AuthorizationRepository) {}

  public async authorize(request: AuthorizationRequest): Promise<AuthorizationDecision> {
    const permissions = await this.repository.getPermissions(
      request.context.identityId,
      request.context.tenantId
    );

    const allowed = permissions.some(
      (permission) =>
        permission.resource === request.resource &&
        permission.action === request.action
    );

    return {
      allowed,
      reason: allowed ? "Permission granted" : "Permission denied"
    };
  }
}
