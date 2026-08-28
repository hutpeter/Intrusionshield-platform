import type { DatabaseManager, SqlParameter } from "@intrusionshield/core";
import type { Permission, Role } from "../types/authorization.js";
import type { RbacRepository } from "../services/rbac-service.js";

interface RoleRow {
  RoleId: string;
  TenantId: string | null;
  Name: string;
  Description: string | null;
}

interface PermissionRow {
  PermissionId: string;
  Name: string;
  Resource: string;
  Action: string;
}

export class SqlRbacRepository implements RbacRepository {
  public constructor(private readonly database: DatabaseManager) {}

  public async createRole(tenantId: string | null, name: string, description?: string): Promise<Role> {
    const result = await this.database.query<RoleRow>(
      `INSERT INTO [identity].[Roles] (TenantId, Name, Description)
       OUTPUT INSERTED.RoleId, INSERTED.TenantId, INSERTED.Name, INSERTED.Description
       VALUES (@tenantId, @name, @description);`,
      [
        { name: "tenantId", value: tenantId },
        { name: "name", value: name },
        { name: "description", value: description ?? null }
      ]
    );

    const row = result.rows[0];
    if (!row) throw new Error("Role creation failed");

    return { id: row.RoleId, tenantId: row.TenantId, name: row.Name, permissions: [] };
  }

  public async deleteRole(roleId: string, tenantId: string): Promise<void> {
    await this.database.execute(
      `DELETE FROM [identity].[Roles]
       WHERE RoleId = @roleId AND (TenantId = @tenantId OR TenantId IS NULL);`,
      [
        { name: "roleId", value: roleId },
        { name: "tenantId", value: tenantId }
      ]
    );
  }

  public async assignRole(identityId: string, roleId: string, tenantId: string): Promise<void> {
    await this.assertTenantMembership(identityId, tenantId);
    await this.assertRoleVisible(roleId, tenantId);

    await this.database.execute(
      `INSERT INTO [identity].[IdentityRoles] (IdentityId, RoleId, TenantId)
       SELECT @identityId, @roleId, @tenantId
       WHERE NOT EXISTS (
         SELECT 1 FROM [identity].[IdentityRoles]
         WHERE IdentityId = @identityId AND RoleId = @roleId AND TenantId = @tenantId
       );`,
      [
        { name: "identityId", value: identityId },
        { name: "roleId", value: roleId },
        { name: "tenantId", value: tenantId }
      ]
    );
  }

  public async removeRole(identityId: string, roleId: string, tenantId: string): Promise<void> {
    await this.database.execute(
      `DELETE FROM [identity].[IdentityRoles]
       WHERE IdentityId = @identityId AND RoleId = @roleId AND TenantId = @tenantId;`,
      [
        { name: "identityId", value: identityId },
        { name: "roleId", value: roleId },
        { name: "tenantId", value: tenantId }
      ]
    );
  }

  public async assignPermission(roleId: string, permissionId: string, tenantId: string): Promise<void> {
    await this.assertRoleVisible(roleId, tenantId);

    await this.database.execute(
      `INSERT INTO [identity].[RolePermissions] (RoleId, PermissionId)
       SELECT @roleId, @permissionId
       WHERE NOT EXISTS (
         SELECT 1 FROM [identity].[RolePermissions]
         WHERE RoleId = @roleId AND PermissionId = @permissionId
       );`,
      [
        { name: "roleId", value: roleId },
        { name: "permissionId", value: permissionId }
      ]
    );
  }

  public async removePermission(roleId: string, permissionId: string, tenantId: string): Promise<void> {
    await this.assertRoleVisible(roleId, tenantId);
    await this.database.execute(
      `DELETE FROM [identity].[RolePermissions]
       WHERE RoleId = @roleId AND PermissionId = @permissionId;`,
      [
        { name: "roleId", value: roleId },
        { name: "permissionId", value: permissionId }
      ]
    );
  }

  public async getRoles(identityId: string, tenantId: string): Promise<readonly Role[]> {
    const result = await this.database.query<RoleRow>(
      `SELECT DISTINCT r.RoleId, r.TenantId, r.Name, r.Description
       FROM [identity].[IdentityRoles] ir
       INNER JOIN [identity].[Roles] r ON r.RoleId = ir.RoleId
       INNER JOIN [identity].[IdentityTenantMemberships] tm
         ON tm.IdentityId = ir.IdentityId AND tm.TenantId = ir.TenantId
       WHERE ir.IdentityId = @identityId
         AND ir.TenantId = @tenantId
         AND tm.MembershipStatus = 'ACTIVE'
         AND (r.TenantId IS NULL OR r.TenantId = @tenantId);`,
      [
        { name: "identityId", value: identityId },
        { name: "tenantId", value: tenantId }
      ]
    );

    return result.rows.map((row) => ({
      id: row.RoleId,
      tenantId: row.TenantId,
      name: row.Name,
      permissions: []
    }));
  }

  public async getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]> {
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
      [
        { name: "identityId", value: identityId },
        { name: "tenantId", value: tenantId }
      ]
    );

    return result.rows.map((row) => ({
      id: row.PermissionId,
      name: row.Name,
      resource: row.Resource,
      action: row.Action
    }));
  }

  private async assertTenantMembership(identityId: string, tenantId: string): Promise<void> {
    const result = await this.database.query<{ IdentityId: string }>(
      `SELECT IdentityId
       FROM [identity].[IdentityTenantMemberships]
       WHERE IdentityId = @identityId
         AND TenantId = @tenantId
         AND MembershipStatus = 'ACTIVE';`,
      [
        { name: "identityId", value: identityId },
        { name: "tenantId", value: tenantId }
      ]
    );

    if (!result.rows[0]) throw new Error("Identity is not an active member of the tenant");
  }

  private async assertRoleVisible(roleId: string, tenantId: string): Promise<void> {
    const result = await this.database.query<{ RoleId: string }>(
      `SELECT RoleId
       FROM [identity].[Roles]
       WHERE RoleId = @roleId AND (TenantId IS NULL OR TenantId = @tenantId);`,
      [
        { name: "roleId", value: roleId },
        { name: "tenantId", value: tenantId }
      ]
    );

    if (!result.rows[0]) throw new Error("Role is not available in the tenant");
  }
}
