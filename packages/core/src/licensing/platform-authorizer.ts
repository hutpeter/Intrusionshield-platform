import type { LicensingAdminAuthorizer, LicensingAdminOperation } from "./administration.js";

export const PLATFORM_LICENSING_RESOURCE = "platform.licensing";
export interface PlatformLicensingPolicy {
  // Must resolve exclusively PLATFORM-scoped permissions for the actor's home tenant.
  hasPlatformPermission(identityId: string, homeTenantId: string, resource: string, action: string): Promise<boolean>;
  // Must independently validate the target customer and the actor's delegated scope.
  canManageCustomer(identityId: string, homeTenantId: string, customerTenantId: string): Promise<boolean>;
}
const actions: Readonly<Record<LicensingAdminOperation,string>> = {
  read:"READ", "create-license":"CREATE_LICENSE", "change-status":"CHANGE_STATUS",
  "assign-entitlement":"ASSIGN_ENTITLEMENT", "revoke-entitlement":"REVOKE_ENTITLEMENT"
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Session must be supplied by trusted authentication middleware, not client claims.
export class PlatformLicensingAuthorizer implements LicensingAdminAuthorizer {
  private readonly identityId: string;
  private readonly homeTenantId: string;
  constructor(private readonly policy: PlatformLicensingPolicy, session: Readonly<{identityId:string;tenantId:string}>) {
    this.identityId = session.identityId;
    this.homeTenantId = session.tenantId;
  }
  async allows(actorId: string, tenantId: string, operation: LicensingAdminOperation): Promise<boolean> {
    if (!uuid.test(actorId) || !uuid.test(tenantId) || !uuid.test(this.homeTenantId) ||
        actorId !== this.identityId || !Object.hasOwn(actions,operation)) return false;
    if (await this.policy.hasPlatformPermission(actorId,this.homeTenantId,PLATFORM_LICENSING_RESOURCE,actions[operation]) !== true) return false;
    return await this.policy.canManageCustomer(actorId,this.homeTenantId,tenantId) === true;
  }
}
