import { AsyncLocalStorage } from "node:async_hooks";
import type { PostgreSqlProvider } from "../providers/PostgreSqlProvider.js";
import type { DatabaseMigration } from "./DatabaseMigration.js";
import type { AppliedMigrationRecord } from "./MigrationPlan.js";
import type { MigrationHistoryStore } from "./VersionedMigrationRunner.js";

/** PostgreSQL migration history and transaction-scoped advisory deployment lock. */
export class PostgreSqlMigrationHistoryStore implements MigrationHistoryStore {
    private readonly lockContext = new AsyncLocalStorage<{ active: boolean }>();
    constructor(private readonly provider: PostgreSqlProvider) {}

    async withExclusiveLock<T>(work: () => Promise<T>): Promise<T> {
        if (this.lockContext.getStore()) throw new Error("Nested migration deployment is not supported.");
        return this.provider.withTransaction(async tx => {
            // Fixed application-specific key. xact lock releases automatically on commit/rollback.
            await tx.query("SELECT pg_advisory_xact_lock(824176501, 3021)");
            const lock = { active: true };
            return this.lockContext.run(lock, async () => {
                try {
                await tx.execute("CREATE TABLE IF NOT EXISTS ruby_schema_migrations (sequence_number bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, migration_id varchar(128) NOT NULL UNIQUE, checksum char(64) NOT NULL)");
                return await work();
                } finally { lock.active = false; }
            });
        });
    }

    async readApplied(): Promise<AppliedMigrationRecord[]> {
        this.requireLock();
        const result = await this.provider.query<{ id: string; checksum: string }>(
            "SELECT migration_id AS id, checksum FROM ruby_schema_migrations ORDER BY sequence_number"
        );
        return result.rows;
    }

    async applyAndRecord(migration: DatabaseMigration, sql: string, checksum: string): Promise<void> {
        this.requireLock();
        await this.provider.execute(sql);
        await this.provider.execute(
            "INSERT INTO ruby_schema_migrations (migration_id, checksum) VALUES ($1, $2)",
            [{ name: "migrationId", value: migration.id }, { name: "checksum", value: checksum }]
        );
    }

    private requireLock(): void {
        if (!this.lockContext.getStore()?.active) throw new Error("Migration history access requires an active exclusive deployment lock.");
    }
}
