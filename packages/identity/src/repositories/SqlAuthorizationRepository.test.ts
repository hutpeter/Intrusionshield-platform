import { describe, expect, it, jest } from "@jest/globals";
import { SqlAuthorizationRepository } from "./SqlAuthorizationRepository.js";
import type { DatabaseManager } from "@intrusionshield/core";

function databaseMock(): DatabaseManager {
  return {
    query: jest.fn(),
    execute: jest.fn()
  } as unknown as DatabaseManager;
}

describe("SqlAuthorizationRepository", () => {
  it("resolves active tenant-scoped RBAC permissions", async () => {
    const database = databaseMock();
    const query = database.query as jest.Mock;
    query.mockResolvedValue({
      rows: [{
        PermissionId: "permission-1",
        Name: "client.read",
        Resource: "client",
        Action: "read"
      }],
      rowCount: 1
    });

    const repository = new SqlAuthorizationRepository(database);
    const permissions = await repository.getPermissions("identity-1", "tenant-1");

    expect(permissions).toEqual([{
      id: "permission-1",
      name: "client.read",
      resource: "client",
      action: "read"
    }]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("tm.MembershipStatus = 'ACTIVE'"),
      expect.arrayContaining([
        { name: "identityId", value: "identity-1" },
        { name: "tenantId", value: "tenant-1" }
      ])
    );
  });

  it("returns no permissions when the identity has none", async () => {
    const database = databaseMock();
    const query = database.query as jest.Mock;
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    const repository = new SqlAuthorizationRepository(database);

    await expect(repository.getPermissions("identity-1", "tenant-1")).resolves.toEqual([]);
  });
});
