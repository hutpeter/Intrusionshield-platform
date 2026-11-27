import type { PlatformLicensingPolicy } from "./platform-authorizer.js";
import type { LicensingSqlExecutor } from "./sql-server-repositories.js";

const params = (values: Record<string,string>) => Object.entries(values).map(([name,value])=>({name,value}));

// Requires the identity and platform registry schemas in the authorization database.
// No role provisioning or scope writes are exposed through this policy.
export class SqlServerPlatformLicensingPolicy implements PlatformLicensingPolicy {
  constructor(private readonly db: Pick<LicensingSqlExecutor,"query">) {}
  async hasPlatformPermission(identityId:string,homeTenantId:string,resource:string,action:string): Promise<boolean> {
    if(resource !== "platform.licensing" || !["READ","CREATE_LICENSE","CHANGE_STATUS","ASSIGN_ENTITLEMENT","REVOKE_ENTITLEMENT"].includes(action)) return false;
    const {rows}=await this.db.query<{allowed:number}>(`SELECT CASE WHEN EXISTS (
      SELECT 1 FROM [Identity].[Identities] i
      JOIN [Identity].[PlatformRoleAssignments] a ON a.TenantId=i.TenantId AND a.IdentityId=i.Id AND a.Scope=N'PLATFORM'
      JOIN [Identity].[Roles] r ON r.Id=a.RoleId AND r.Scope=N'PLATFORM' AND r.TenantId IS NULL
      JOIN [Identity].[RolePermissions] rp ON rp.RoleId=r.Id AND rp.Scope=N'PLATFORM'
      JOIN [Identity].[Permissions] p ON p.Id=rp.PermissionId AND p.Scope=N'PLATFORM'
      WHERE i.Id=@identityId AND i.TenantId=@homeTenantId AND i.Status=N'ACTIVE'
      AND p.Resource=@resource AND p.Action=@action
    ) THEN 1 ELSE 0 END AS allowed`,params({identityId,homeTenantId,resource,action}));
    return rows[0]?.allowed===1;
  }
  async canManageCustomer(identityId:string,homeTenantId:string,customerTenantId:string): Promise<boolean> {
    const {rows}=await this.db.query<{allowed:number}>(`SELECT CASE WHEN EXISTS (
      SELECT 1 FROM [Platform].[LicensingCustomerScopes] s
      JOIN [Platform].[Tenants] t ON t.Id=s.CustomerTenantId
      JOIN [Identity].[Identities] i ON i.Id=s.IdentityId AND i.TenantId=s.HomeTenantId AND i.Status=N'ACTIVE'
      WHERE s.IdentityId=@identityId AND s.HomeTenantId=@homeTenantId AND s.CustomerTenantId=@customerTenantId
      AND s.RevokedAt IS NULL AND s.EffectiveFrom<=SYSUTCDATETIME()
      AND (s.EffectiveUntil IS NULL OR s.EffectiveUntil>SYSUTCDATETIME())
    ) THEN 1 ELSE 0 END AS allowed`,params({identityId,homeTenantId,customerTenantId}));
    return rows[0]?.allowed===1;
  }
}
