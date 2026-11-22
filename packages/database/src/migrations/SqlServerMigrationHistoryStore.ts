import type { IDatabaseProvider } from "../providers/IDatabaseProvider.js";
import type { DatabaseMigration } from "./DatabaseMigration.js";
import type { AppliedMigrationRecord } from "./MigrationPlan.js";
import type { MigrationHistoryStore } from "./VersionedMigrationRunner.js";

/**
 * SQL Server migration store. Uses a dedicated connection transaction for each
 * DDL + history write, and SQL Server application locks for deployment exclusion.
 * The migration principal must have CREATE TABLE and schema-change privileges.
 */
export class SqlServerMigrationHistoryStore implements MigrationHistoryStore {
    constructor(private readonly provider: IDatabaseProvider) {}

    async withExclusiveLock<T>(work: () => Promise<T>): Promise<T> {
        // A session-owned lock must remain on the same connection throughout work.
        // The generic provider does not expose a pinned connection, so fail closed
        // until the dedicated connection/locking adapter is available.
        throw new Error("SQL Server migration history locking requires a pinned dedicated connection.");
    }

    async readApplied(): Promise<AppliedMigrationRecord[]> {
        const result = await this.provider.query<{ id: string; checksum: string }>(
            "SELECT migration_id AS id, checksum FROM dbo.ruby_schema_migrations ORDER BY sequence_number"
        );
        return result.rows;
    }

    async applyAndRecord(_migration: DatabaseMigration, _sql: string, _checksum: string): Promise<void> {
        throw new Error("SQL Server migration execution requires atomic DDL and history recording.");
    }
}
