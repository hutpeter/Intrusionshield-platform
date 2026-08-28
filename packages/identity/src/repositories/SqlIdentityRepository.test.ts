import { describe, expect, it, jest } from "@jest/globals";
import { SqlIdentityRepository } from "./SqlIdentityRepository.js";
import type { DatabaseManager } from "@intrusionshield/core";

function databaseMock(): DatabaseManager {
  return {
    query: jest.fn(),
    execute: jest.fn()
  } as unknown as DatabaseManager;
}

describe("SqlIdentityRepository", () => {
  it("loads an identity within the requested tenant", async () => {
    const database = databaseMock();
    const query = database.query as jest.Mock;
    query.mockResolvedValue({
      rows: [{
        IdentityId: "identity-1",
        TenantId: "tenant-1",
        IdentityType: "USER",
        Status: "ACTIVE",
        DisplayName: "Admin",
        CreatedAt: new Date("2026-01-01T00:00:00Z"),
        UpdatedAt: new Date("2026-01-01T00:00:00Z")
      }],
      rowCount: 1
    });

    const repository = new SqlIdentityRepository(database);
    const result = await repository.findById("identity-1", "tenant-1");

    expect(result?.id).toBe("identity-1");
    expect(result?.tenantId).toBe("tenant-1");
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("IdentityId = @identityId AND TenantId = @tenantId"),
      expect.arrayContaining([
        { name: "identityId", value: "identity-1" },
        { name: "tenantId", value: "tenant-1" }
      ])
    );
  });

  it("does not report an identity from another tenant", async () => {
    const database = databaseMock();
    const query = database.query as jest.Mock;
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    const repository = new SqlIdentityRepository(database);

    await expect(repository.findById("identity-1", "tenant-2")).resolves.toBeNull();
  });

  it("updates status using tenant-scoped parameters", async () => {
    const database = databaseMock();
    const execute = database.execute as jest.Mock;
    execute.mockResolvedValue(1);

    const repository = new SqlIdentityRepository(database);
    await repository.updateStatus("identity-1", "tenant-1", "SUSPENDED");

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("WHERE IdentityId = @identityId AND TenantId = @tenantId"),
      expect.arrayContaining([
        { name: "identityId", value: "identity-1" },
        { name: "tenantId", value: "tenant-1" },
        { name: "status", value: "SUSPENDED" }
      ])
    );
  });

  it("rejects a status update when no tenant-scoped identity exists", async () => {
    const database = databaseMock();
    const execute = database.execute as jest.Mock;
    execute.mockResolvedValue(0);

    const repository = new SqlIdentityRepository(database);

    await expect(
      repository.updateStatus("identity-1", "tenant-1", "DISABLED")
    ).rejects.toThrow("Identity not found");
  });
});
