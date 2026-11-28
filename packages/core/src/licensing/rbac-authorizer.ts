import type { LicensingAdminAuthorizer, LicensingAdminOperation } from "./administration.js";

// Structural subset of Ruby Identity AuthorizationService; no package dependency.
export interface LicensingRbacService {
  authorize(request: {
    resource: string;
    action: string;
    context: {identityId: string; tenantId: string; roles: readonly string[]; attributes: Readonly<Record<string, unknown>>};
  }): Promise<{allowed: boolean}>;
}
export const LICENSING_ADMIN_RESOURCE = "licensing.administration";

// Construct per verified server-side session, never from request body claims.
// Cross-tenant platform administration requires a separate explicit policy.
export class RbacLicensingAuthorizer implements LicensingAdminAuthorizer {
  constructor(private readonly rbac: LicensingRbacService,
    private readonly session: Readonly<{identityId: string; tenantId: string}>) {}
  async allows(actorId: string, tenantId: string, operation: LicensingAdminOperation): Promise<boolean> {
    if (!actorId || !tenantId || actorId !== this.session.identityId || tenantId !== this.session.tenantId) return false;
    const decision = await this.rbac.authorize({
      resource: LICENSING_ADMIN_RESOURCE, action: operation,
      context: {identityId: actorId, tenantId, roles: [], attributes: {}}
    });
    return decision.allowed === true;
  }
}
