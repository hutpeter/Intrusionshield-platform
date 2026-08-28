import type { Permission, Role } from "../types/authorization.js";

export interface RbacRepository {
  createRole(tenantId: string | null, name: string, description?: string): Promise<Role>;
  deleteRole(roleId: string, tenantId: string): Promise<void>;
  assignRole(identityId: string, roleId: string, tenantId: string): Promise<void>;
  removeRole(identityId: string, roleId: string, tenantId: string): Promise<void>;
  assignPermission(roleId: string, permissionId: string, tenantId: string): Promise<void>;
  removePermission(roleId: string, permissionId: string, tenantId: string): Promise<void>;
  getRoles(identityId: string, tenantId: string): Promise<readonly Role[]>;
  getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]>;
}

export class RbacService {
  public constructor(private readonly repository: RbacRepository) {}

  public createRole(tenantId: string | null, name: string, description?: string): Promise<Role> {
    return this.repository.createRole(tenantId, name, description);
  }

  public deleteRole(roleId: string, tenantId: string): Promise<void> {
    return this.repository.deleteRole(roleId, tenantId);
  }

  public assignRole(identityId: string, roleId: string, tenantId: string): Promise<void> {
    return this.repository.assignRole(identityId, roleId, tenantId);
  }

  public removeRole(identityId: string, roleId: string, tenantId: string): Promise<void> {
    return this.repository.removeRole(identityId, roleId, tenantId);
  }

  public assignPermission(roleId: string, permissionId: string, tenantId: string): Promise<void> {
    return this.repository.assignPermission(roleId, permissionId, tenantId);
  }

  public removePermission(roleId: string, permissionId: string, tenantId: string): Promise<void> {
    return this.repository.removePermission(roleId, permissionId, tenantId);
  }

  public getRoles(identityId: string, tenantId: string): Promise<readonly Role[]> {
    return this.repository.getRoles(identityId, tenantId);
  }

  public getPermissions(identityId: string, tenantId: string): Promise<readonly Permission[]> {
    return this.repository.getPermissions(identityId, tenantId);
  }
}
