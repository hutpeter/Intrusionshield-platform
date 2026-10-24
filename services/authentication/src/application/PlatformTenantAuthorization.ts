
import type { IDatabaseProvider } from "@intrusionshield/database";

export type PlatformTenantPermission =
    | {
        resource: "platform.tenants";
        action: "READ" | "CREATE";
    }
    | {
        resource: "platform.tenant-provisioning-audit";
        action: "READ";
    };

export class PlatformTenantAuthorization {
    constructor(
        private readonly database: IDatabaseProvider
    ) {}

    async allowed(
        identityId: string,
        tenantId: string,
        action: "READ" | "CREATE",
        resource: PlatformTenantPermission["resource"] = "platform.tenants"
    ): Promise<boolean> {
        const uuid =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (
            !uuid.test(identityId) ||
            !uuid.test(tenantId)
        ) {
            return false;
        }

        if (
            resource === "platform.tenant-provisioning-audit" &&
            action !== "READ"
        ) {
            return false;
        }

        const result = await this.database.query<{
            allowed: number;
        }>(
            `SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM [Identity].[Identities] i
                JOIN [Identity].[PlatformRoleAssignments] a
                  ON a.TenantId = i.TenantId
                 AND a.IdentityId = i.Id
                 AND a.Scope = N'PLATFORM'
                JOIN [Identity].[Roles] r
                  ON r.Id = a.RoleId
                 AND r.Scope = N'PLATFORM'
                 AND r.TenantId IS NULL
                JOIN [Identity].[RolePermissions] rp
                  ON rp.RoleId = r.Id
                 AND rp.Scope = N'PLATFORM'
                JOIN [Identity].[Permissions] p
                  ON p.Id = rp.PermissionId
                 AND p.Scope = N'PLATFORM'
                WHERE i.Id = @identityId
                  AND i.TenantId = @tenantId
                  AND i.Status = N'ACTIVE'
                  AND p.Resource = @resource
                  AND p.Action = @action
            ) THEN 1 ELSE 0 END AS allowed`,
            [
                {
                    name: "identityId",
                    value: identityId
                },
                {
                    name: "tenantId",
                    value: tenantId
                },
                {
                    name: "resource",
                    value: resource
                },
                {
                    name: "action",
                    value: action
                }
            ]
        );

        return result.rows[0]?.allowed === 1;
    }
}
