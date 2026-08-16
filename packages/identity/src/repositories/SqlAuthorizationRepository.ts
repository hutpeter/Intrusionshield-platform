import type { DatabaseManager, SqlParameter } from "@intrusionshield/core";
import type { Permission } from "../types/authorization.js";
import type { AuthorizationRepository } from "./authorization-repository.js";

interface PermissionRow {
  PermissionId: string;
  Name: string;
  Resource: string;
  Action: string;
}

/** Resolves effective RBAC permissions for an identity within one tenant. */
export class SqlAuthorizationRepository implements AuthorizationRepository {
  public constructor(private readonly database: DatabaseManager) {}

  public async getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]> {
    const parameters: SqlParameter[] = [
      { name: "identityId", value: identityId },
      { name: "tenantId", value: tenantId }
    ];

    const result = await this.database.query<PermissionRow>(
      `SELECT DISTINCT p.PermissionId, p.Name, p.Resource, p.Action
       FROM [identity].[IdentityRoles] ir
       INNER JOIN [identity].[Roles] r ON r.RoleId = ir.RoleId
       INNER JOIN [identity].[RolePermissions] rp ON rp.RoleId = r.RoleId
       INNER JOIN [identity].[Permissions] p ON p.PermissionId = rp.PermissionId
       INNER JOIN [identity].[IdentityTenantMemberships] tm
         ON tm.IdentityId = ir.IdentityId AND tm.TenantId = ir.TenantId
       WHERE ir.IdentityId = @identityId
         AND ir.TenantId = @tenantId
         AND tm.MembershipStatus = 'ACTIVE'
         AND (r.TenantId IS NULL OR r.TenantId = @tenantId);`,
      parameters
    );

    return result.rows.map((row) => ({
      id: row.PermissionId,
      name: row.Name,
      resource: row.Resource,
      action: row.Action
    }));
  }
}
