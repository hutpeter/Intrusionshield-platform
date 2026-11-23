import type {
    IDatabaseProvider,
    DatabaseDialect
} from "@intrusionshield/database";

import { SqlServerDialect } from "@intrusionshield/database";

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
        private readonly database: IDatabaseProvider,
        private readonly dialect: DatabaseDialect = new SqlServerDialect()
    ) {}

    public async getPermissions(
        identityId: string,
        tenantId: string
    ): Promise<readonly Permission[]> {
        if (this.dialect.engine !== "sqlserver" && this.dialect.engine !== "postgresql") {
            throw new Error("Unsupported identity persistence database engine.");
        }
        const q = (name: string) => this.dialect.quoteIdentifier(name);
        const table = (name: string) => `${q("Identity")}.${q(name)}`;
        const identityParam = this.dialect.engine === "postgresql" ? "$1" : "@identityId";
        const tenantParam = this.dialect.engine === "postgresql" ? "$2" : "@tenantId";
        const literal = (value: string) => this.dialect.engine === "sqlserver" ? `N'${value}'` : `'${value}'`;
        const tenantPermissions = `SELECT DISTINCT
            p.${q("Id")} AS id, p.${q("Name")} AS name,
            p.${q("Resource")} AS resource, p.${q("Action")} AS action
            FROM ${table("Identities")} i
            INNER JOIN ${table("IdentityRoles")} ir
                ON ir.${q("IdentityId")} = i.${q("Id")}
                AND ir.${q("TenantId")} = i.${q("TenantId")}
                AND ir.${q("Scope")} = ${literal("TENANT")}
            INNER JOIN ${table("Roles")} r
                ON r.${q("Id")} = ir.${q("RoleId")}
                AND r.${q("TenantId")} = i.${q("TenantId")}
                AND r.${q("Scope")} = ${literal("TENANT")}
            INNER JOIN ${table("RolePermissions")} rp
                ON rp.${q("RoleId")} = r.${q("Id")}
                AND rp.${q("Scope")} = ${literal("TENANT")}
            INNER JOIN ${table("Permissions")} p
                ON p.${q("Id")} = rp.${q("PermissionId")}
                AND p.${q("Scope")} = ${literal("TENANT")}
            WHERE i.${q("Id")} = ${identityParam}
                AND i.${q("TenantId")} = ${tenantParam}
                AND i.${q("Status")} = ${literal("ACTIVE")}`;
        const platformPermissions = `SELECT DISTINCT
            p.${q("Id")} AS id, p.${q("Name")} AS name,
            p.${q("Resource")} AS resource, p.${q("Action")} AS action
            FROM ${table("Identities")} i
            INNER JOIN ${table("PlatformRoleAssignments")} pra
                ON pra.${q("IdentityId")} = i.${q("Id")}
                AND pra.${q("TenantId")} = i.${q("TenantId")}
                AND pra.${q("Scope")} = ${literal("PLATFORM")}
            INNER JOIN ${table("Roles")} r
                ON r.${q("Id")} = pra.${q("RoleId")}
                AND r.${q("Scope")} = ${literal("PLATFORM")}
                AND r.${q("TenantId")} IS NULL
            INNER JOIN ${table("RolePermissions")} rp
                ON rp.${q("RoleId")} = r.${q("Id")}
                AND rp.${q("Scope")} = ${literal("PLATFORM")}
            INNER JOIN ${table("Permissions")} p
                ON p.${q("Id")} = rp.${q("PermissionId")}
                AND p.${q("Scope")} = ${literal("PLATFORM")}
            WHERE i.${q("Id")} = ${identityParam}
                AND i.${q("TenantId")} = ${tenantParam}
                AND i.${q("Status")} = ${literal("ACTIVE")}`;
        const result = await this.database.query<PermissionRow>(
            `${tenantPermissions} UNION ${platformPermissions}`,
            [{ name: "identityId", value: identityId }, { name: "tenantId", value: tenantId }]
        );

        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            resource: row.resource,
            action: row.action
        }));
    }
}
