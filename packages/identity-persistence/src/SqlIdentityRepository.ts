import type {
    IDatabaseProvider
} from "@intrusionshield/database";

import type {
    Identity,
    IdentityStatus
} from "@intrusionshield/identity";

import type {
    IdentityRepository
} from "@intrusionshield/identity";

interface IdentityRow {
    id: string;
    tenantId: string;
    type: Identity["type"];
    status: Identity["status"];
    displayName: string;
    createdAt: Date;
    updatedAt: Date;
}

export class SqlIdentityRepository
implements IdentityRepository {
    public constructor(
        private readonly database: IDatabaseProvider
    ) {}

    public async findById(
        id: string,
        tenantId: string
    ): Promise<Identity | null> {
        const result =
            await this.database.query<IdentityRow>(
                `SELECT
                    Id AS id,
                    TenantId AS tenantId,
                    IdentityType AS type,
                    Status AS status,
                    DisplayName AS displayName,
                    CreatedAt AS createdAt,
                    UpdatedAt AS updatedAt
                 FROM [Identity].[Identities]
                 WHERE Id = @id
                   AND TenantId = @tenantId`,
                [
                    { name: "id", value: id },
                    { name: "tenantId", value: tenantId }
                ]
            );

        const row = result.rows[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            tenantId: row.tenantId,
            type: row.type,
            status: row.status,
            displayName: row.displayName,
            createdAt: new Date(row.createdAt),
            updatedAt: new Date(row.updatedAt)
        };
    }

    public async updateStatus(
        id: string,
        tenantId: string,
        status: IdentityStatus
    ): Promise<void> {
        const affected =
            await this.database.execute(
                `UPDATE [Identity].[Identities]
                 SET
                    Status = @status,
                    UpdatedAt = SYSUTCDATETIME()
                 WHERE Id = @id
                   AND TenantId = @tenantId`,
                [
                    { name: "id", value: id },
                    { name: "tenantId", value: tenantId },
                    { name: "status", value: status }
                ]
            );

        if (affected !== 1) {
            throw new Error(
                "Identity was not found."
            );
        }
    }
}
