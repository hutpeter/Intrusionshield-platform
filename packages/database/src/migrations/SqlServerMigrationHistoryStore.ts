import type { SqlServerProvider } from "../providers/SqlServerProvider.js";
import type { DatabaseMigration } from "./DatabaseMigration.js";
import type { AppliedMigrationRecord } from "./MigrationPlan.js";
import type { MigrationHistoryStore } from "./VersionedMigrationRunner.js";
import { AsyncLocalStorage } from "node:async_hooks";

/** All migration DDL and history writes share a single SQL Server transaction. */
export class SqlServerMigrationHistoryStore implements MigrationHistoryStore {
    private readonly lockContext = new AsyncLocalStorage<boolean>();
    constructor(private readonly provider: SqlServerProvider) {}

    async withExclusiveLock<T>(work: () => Promise<T>): Promise<T> {
        if (this.lockContext.getStore()) throw new Error("Nested migration deployment is not supported.");
        return this.provider.withTransaction(async tx => {
            const lock = await tx.query<{ lock_result: number }>(
                "DECLARE @result int; EXEC @result = sys.sp_getapplock @Resource=N'ruby.schema_migrations', @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=30000; SELECT @result AS lock_result"
            );
            if ((lock.rows[0]?.lock_result ?? -999) < 0) throw new Error("Could not acquire SQL Server migration deployment lock.");
            return this.lockContext.run(true, async () => {
                await tx.execute("IF OBJECT_ID(N'dbo.ruby_schema_migrations', N'U') IS NULL CREATE TABLE dbo.ruby_schema_migrations (sequence_number bigint IDENTITY(1,1) NOT NULL PRIMARY KEY, migration_id nvarchar(128) NOT NULL UNIQUE, checksum char(64) NOT NULL)");
                return work();
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
        await this.provider.execute(sql);
        await this.provider.execute(
            "INSERT INTO dbo.ruby_schema_migrations (migration_id, checksum) VALUES (@migrationId, @checksum)",
            [{ name: "migrationId", value: migration.id }, { name: "checksum", value: checksum }]
        );
    }

    private requireLock(): void {
        if (!this.lockContext.getStore()) throw new Error("Migration history access requires exclusive deployment lock.");
    }
}
