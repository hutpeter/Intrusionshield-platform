import type { IDatabaseProvider } from "@intrusionshield/database";

export class PlatformTenantAuthorization {
    constructor(private readonly database: IDatabaseProvider) {}

    async allowed(identityId: string, tenantId: string, action: "READ" | "CREATE"): Promise<boolean> {
        const result = await this.database.query<{ allowed: number }>(
            `SELECT CASE WHEN EXISTS (
                SELECT 1 FROM [Identity].[Identities] i
                JOIN [Identity].[PlatformRoleAssignments] a
                  ON a.TenantId = i.TenantId AND a.IdentityId = i.Id AND a.Scope = N'PLATFORM'
                JOIN [Identity].[Roles] r
                  ON r.Id = a.RoleId AND r.Scope = N'PLATFORM' AND r.TenantId IS NULL
                JOIN [Identity].[RolePermissions] rp
                  ON rp.RoleId = r.Id AND rp.Scope = N'PLATFORM'
                JOIN [Identity].[Permissions] p
                  ON p.Id = rp.PermissionId AND p.Scope = N'PLATFORM'
                WHERE i.Id = @identityId AND i.TenantId = @tenantId
                  AND i.Status = N'ACTIVE'
                  AND p.Resource = N'platform.tenants' AND p.Action = @action
            ) THEN 1 ELSE 0 END AS allowed`,
            [
                { name: "identityId", value: identityId },
                { name: "tenantId", value: tenantId },
                { name: "action", value: action }
            ]
        );
        return result.rows[0]?.allowed === 1;
    }
}
