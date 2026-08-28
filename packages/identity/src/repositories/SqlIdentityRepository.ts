import type { DatabaseManager, SqlParameter } from "@intrusionshield/core";
import type { IdentityStatus } from "../types/identity.js";
import type { IdentityRecord, IdentityRepository } from "./identity-repository.js";

interface IdentityRow {
  IdentityId: string;
  TenantId: string;
  IdentityType: "USER" | "SERVICE" | "APPLICATION" | "API";
  Status: IdentityStatus;
  DisplayName: string;
  CreatedAt: Date;
  UpdatedAt: Date;
}

/** SQL Server adapter for the tenant-scoped identity repository. */
export class SqlIdentityRepository implements IdentityRepository {
  public constructor(private readonly database: DatabaseManager) {}

  public async findById(id: string, tenantId: string): Promise<IdentityRecord | null> {
    const parameters: SqlParameter[] = [
      { name: "identityId", value: id },
      { name: "tenantId", value: tenantId }
    ];

    const result = await this.database.query<IdentityRow>(
      `SELECT IdentityId, TenantId, IdentityType, Status, DisplayName, CreatedAt, UpdatedAt
       FROM [identity].[Identities]
       WHERE IdentityId = @identityId AND TenantId = @tenantId;`,
      parameters
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.IdentityId,
      tenantId: row.TenantId,
      type: row.IdentityType,
      status: row.Status,
      displayName: row.DisplayName,
      createdAt: row.CreatedAt,
      updatedAt: row.UpdatedAt
    };
  }

  public async updateStatus(id: string, tenantId: string, status: IdentityStatus): Promise<void> {
    const parameters: SqlParameter[] = [
      { name: "identityId", value: id },
      { name: "tenantId", value: tenantId },
      { name: "status", value: status }
    ];

    const affected = await this.database.execute(
      `UPDATE [identity].[Identities]
       SET Status = @status, UpdatedAt = SYSUTCDATETIME()
       WHERE IdentityId = @identityId AND TenantId = @tenantId;`,
      parameters
    );

    if (affected === 0) {
      throw new Error("Identity not found");
    }
  }
}
