import type { SqlServerProvider } from "../providers/SqlServerProvider.js";
import type { DatabaseMigration } from "./DatabaseMigration.js";
import type { AppliedMigrationRecord } from "./MigrationPlan.js";
import type { MigrationHistoryStore } from "./VersionedMigrationRunner.js";
import { AsyncLocalStorage } from "node:async_hooks";

/** Split sqlcmd GO batch delimiters without interpreting GO inside a SQL statement. */
export function splitSqlServerMigrationBatches(sql: string): string[] {
    // Reject sqlcmd repeat counts: replaying DDL is unsafe for versioned migrations.
    if (/^[ \t]*GO[ \t]+\d+[ \t]*(?:--[^\r\n]*)?$/gim.test(sql)) {
        throw new Error("SQL Server migration GO repeat counts are not supported.");
    }
    const batches = sql.split(/^[ \t]*GO[ \t]*(?:--[^\r\n]*)?$/gim)
        .map(batch => batch.trim()).filter(Boolean);
    if (batches.length === 0) throw new Error("SQL Server migration contains no executable batches.");
    return batches;
}

/** All migration DDL and history writes share a single SQL Server transaction. */
export class SqlServerMigrationHistoryStore implements MigrationHistoryStore {
    private readonly lockContext = new AsyncLocalStorage<{ active: boolean }>();
    constructor(private readonly provider: SqlServerProvider) {}

    async withExclusiveLock<T>(work: () => Promise<T>): Promise<T> {
        if (this.lockContext.getStore()?.active) throw new Error("Nested migration deployment is not supported.");
        return this.provider.withTransaction(async tx => {
            const acquisition = await tx.query<{ lock_result: number }>(
                "DECLARE @result int; EXEC @result = sys.sp_getapplock @Resource=N'ruby.schema_migrations', @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=30000; SELECT @result AS lock_result"
            );
            if ((acquisition.rows[0]?.lock_result ?? -999) < 0) throw new Error("Could not acquire SQL Server migration deployment lock.");
            const lock = { active: true };
            return this.lockContext.run(lock, async () => {
                try {
                await tx.execute("IF OBJECT_ID(N'dbo.ruby_schema_migrations', N'U') IS NULL CREATE TABLE dbo.ruby_schema_migrations (sequence_number bigint IDENTITY(1,1) NOT NULL PRIMARY KEY, migration_id nvarchar(128) NOT NULL UNIQUE, checksum char(64) NOT NULL)");
                return await work();
                } finally { lock.active = false; }
            });
        });
    }

    async readApplied(): Promise<AppliedMigrationRecord[]> {
        this.requireLock();
        const result = await this.provider.query<{ id: string; checksum: string }>(
            "SELECT migration_id AS id, checksum FROM dbo.ruby_schema_migrations ORDER BY sequence_number"
        );
        return result.rows;
    }

    async applyAndRecord(migration: DatabaseMigration, sql: string, checksum: string): Promise<void> {
        this.requireLock();
        // GO is a client-side batch separator, not executable T-SQL.
        // Existing SQL Server foundation migrations contain GO between DDL batches.
        const batches = splitSqlServerMigrationBatches(sql);
        for (const batch of batches) {
            await this.provider.execute(batch);
        }
        await this.provider.execute(
            "INSERT INTO dbo.ruby_schema_migrations (migration_id, checksum) VALUES (@migrationId, @checksum)",
            [{ name: "migrationId", value: migration.id }, { name: "checksum", value: checksum }]
        );
    }

    private requireLock(): void {
        if (!this.lockContext.getStore()?.active) throw new Error("Migration history access requires an active exclusive deployment lock.");
    }
}
