import type {
    IDatabaseProvider,
    DatabaseDialect
} from "@intrusionshield/database";

import { SqlServerDialect } from "@intrusionshield/database";

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
        private readonly database: IDatabaseProvider,
        private readonly dialect: DatabaseDialect = new SqlServerDialect()
    ) {}

    public async findById(
        id: string,
        tenantId: string
    ): Promise<Identity | null> {
        if (this.dialect.engine !== "sqlserver" && this.dialect.engine !== "postgresql") {
            throw new Error("Unsupported identity persistence database engine.");
        }
        const table = `${this.dialect.quoteIdentifier("Identity")}.${this.dialect.quoteIdentifier("Identities")}`;
        const col = (name: string) => this.dialect.quoteIdentifier(name);
        const idParam = this.dialect.engine === "postgresql" ? "$1" : "@id";
        const tenantParam = this.dialect.engine === "postgresql" ? "$2" : "@tenantId";
        const result =
            await this.database.query<IdentityRow>(
                `SELECT
                    ${col("Id")} AS id,
                    ${col("TenantId")} AS "tenantId",
                    ${col("IdentityType")} AS type,
                    ${col("Status")} AS status,
                    ${col("DisplayName")} AS "displayName",
                    ${col("CreatedAt")} AS "createdAt",
                    ${col("UpdatedAt")} AS "updatedAt"
                 FROM ${table}
                 WHERE ${col("Id")} = ${idParam}
                   AND ${col("TenantId")} = ${tenantParam}`,
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
        if (this.dialect.engine !== "sqlserver" && this.dialect.engine !== "postgresql") {
            throw new Error("Unsupported identity persistence database engine.");
        }
        const table = `${this.dialect.quoteIdentifier("Identity")}.${this.dialect.quoteIdentifier("Identities")}`;
        const col = (name: string) => this.dialect.quoteIdentifier(name);
        const statusParam = this.dialect.engine === "postgresql" ? "$3" : "@status";
        const idParam = this.dialect.engine === "postgresql" ? "$1" : "@id";
        const tenantParam = this.dialect.engine === "postgresql" ? "$2" : "@tenantId";
        const utcNow = this.dialect.engine === "postgresql" ? "CURRENT_TIMESTAMP" : "SYSUTCDATETIME()";
        const affected =
            await this.database.execute(
                `UPDATE ${table}
                 SET
                    ${col("Status")} = ${statusParam},
                    ${col("UpdatedAt")} = ${utcNow}
                 WHERE ${col("Id")} = ${idParam}
                   AND ${col("TenantId")} = ${tenantParam}`,
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
