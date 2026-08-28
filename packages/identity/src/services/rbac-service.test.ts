import { describe, expect, it, jest } from "@jest/globals";
import { RbacService, type RbacRepository } from "./rbac-service.js";
import type { Role } from "../types/authorization.js";

const role = (tenantId: string | null): Role => ({
  id: "role-1",
  tenantId,
  name: "SECURITY_ADMIN",
  permissions: []
});

describe("RbacService tenant isolation", () => {
  it("passes the caller tenant to role resolution", async () => {
    const repository: RbacRepository = {
      createRole: jest.fn(async () => role("tenant-a")),
      deleteRole: jest.fn(async () => undefined),
      assignRole: jest.fn(async () => undefined),
      removeRole: jest.fn(async () => undefined),
      assignPermission: jest.fn(async () => undefined),
      removePermission: jest.fn(async () => undefined),
      getRoles: jest.fn(async (_identityId, tenantId) => tenantId === "tenant-a" ? [role("tenant-a")] : []),
      getPermissions: jest.fn(async () => [])
    };

    const service = new RbacService(repository);

    await expect(service.getRoles("identity-1", "tenant-a")).resolves.toHaveLength(1);
    await expect(service.getRoles("identity-1", "tenant-b")).resolves.toHaveLength(0);
    expect(repository.getRoles).toHaveBeenNthCalledWith(1, "identity-1", "tenant-a");
    expect(repository.getRoles).toHaveBeenNthCalledWith(2, "identity-1", "tenant-b");
  });

  it("never changes a role without a tenant context", async () => {
    const repository: RbacRepository = {
      createRole: jest.fn(async () => role(null)),
      deleteRole: jest.fn(async () => undefined),
      assignRole: jest.fn(async () => undefined),
      removeRole: jest.fn(async () => undefined),
      assignPermission: jest.fn(async () => undefined),
      removePermission: jest.fn(async () => undefined),
      getRoles: jest.fn(async () => []),
      getPermissions: jest.fn(async () => [])
    };

    const service = new RbacService(repository);
    await service.assignRole("identity-1", "role-1", "tenant-a");
    await service.removeRole("identity-1", "role-1", "tenant-a");

    expect(repository.assignRole).toHaveBeenCalledWith("identity-1", "role-1", "tenant-a");
    expect(repository.removeRole).toHaveBeenCalledWith("identity-1", "role-1", "tenant-a");
  });
});
