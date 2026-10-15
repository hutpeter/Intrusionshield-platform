import type {
    IDatabaseProvider
} from "@intrusionshield/database";

import type {
    AuthorizationRepository,
    Permission
} from "@intrusionshield/identity";

interface PermissionRow {
    id: string;
    name: string;
    resource: string;
    action: string;
}

export class SqlAuthorizationRepository
implements AuthorizationRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async getPermissions(
        identityId: string,
        tenantId: string
    ): Promise<readonly Permission[]> {
        const result =
            await this.database.query<PermissionRow>(
                `SELECT DISTINCT
                    p.Id AS id,
                    p.Name AS name,
                    p.Resource AS resource,
                    p.Action AS action
                 FROM [Identity].[Identities] i
                 INNER JOIN [Identity].[IdentityRoles] ir
                     ON ir.IdentityId = i.Id
                    AND ir.TenantId = i.TenantId
                    AND ir.Scope = N'TENANT'
                 INNER JOIN [Identity].[Roles] r
                     ON r.Id = ir.RoleId
                    AND r.TenantId = i.TenantId
                    AND r.Scope = N'TENANT'
                 INNER JOIN [Identity].[RolePermissions] rp
                     ON rp.RoleId = r.Id
                    AND rp.Scope = N'TENANT'
                 INNER JOIN [Identity].[Permissions] p
                     ON p.Id = rp.PermissionId
                    AND p.Scope = N'TENANT'
                 WHERE i.Id = @identityId
                   AND i.TenantId = @tenantId
                   AND i.Status = N'ACTIVE'

                 UNION

                 SELECT DISTINCT
                    p.Id AS id,
                    p.Name AS name,
                    p.Resource AS resource,
                    p.Action AS action
                 FROM [Identity].[Identities] i
                 INNER JOIN [Identity].[PlatformRoleAssignments] pra
                     ON pra.IdentityId = i.Id
                    AND pra.TenantId = i.TenantId
                    AND pra.Scope = N'PLATFORM'
                 INNER JOIN [Identity].[Roles] r
                     ON r.Id = pra.RoleId
                    AND r.Scope = N'PLATFORM'
                    AND r.TenantId IS NULL
                 INNER JOIN [Identity].[RolePermissions] rp
                     ON rp.RoleId = r.Id
                    AND rp.Scope = N'PLATFORM'
                 INNER JOIN [Identity].[Permissions] p
                     ON p.Id = rp.PermissionId
                    AND p.Scope = N'PLATFORM'
                 WHERE i.Id = @identityId
                   AND i.TenantId = @tenantId
                   AND i.Status = N'ACTIVE'`,
                [
                    { name: "identityId", value: identityId },
                    { name: "tenantId", value: tenantId }
                ]
            );

        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            resource: row.resource,
            action: row.action
        }));
    }
}
