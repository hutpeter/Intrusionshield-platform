import type { DatabaseEngine } from "../dialects/DatabaseDialect.js";
import type { DatabaseMigration } from "./DatabaseMigration.js";
import { migrationChecksum, planDatabaseMigrations, type AppliedMigrationRecord } from "./MigrationPlan.js";

/**
 * Persist migration history in an existing deployment-owned table.
 * Caller must establish the table and hold an exclusive deployment lock.
 * The callback must execute the DDL and record its history atomically.
 */
export interface MigrationHistoryStore {
    readApplied(): Promise<AppliedMigrationRecord[]>;
    applyAndRecord(migration: DatabaseMigration, sql: string, checksum: string): Promise<void>;
    /** Hold a cross-process exclusive lock for the full history read and application. */
    withExclusiveLock<T>(work: () => Promise<T>): Promise<T>;
}

/**
 * Version-aware migration orchestration, deliberately independent of SQL syntax.
 * The caller is responsible for a cross-process exclusive lock and a durable,
 * transactional history store. Never call with an untrusted history store.
 */
export async function runVersionedMigrations(
    engine: DatabaseEngine,
    migrations: readonly DatabaseMigration[],
    history: MigrationHistoryStore
): Promise<string[]> {
    // Reject invalid deployment input before opening a transaction, acquiring a
    // deployment lock, or creating a migration history table.
    planDatabaseMigrations(engine, migrations, []);
    return history.withExclusiveLock(async () => {
        const applied = await history.readApplied();
        const pending = planDatabaseMigrations(engine, migrations, applied);
        const completed: string[] = [];
        for (const migration of pending) {
            const sql = engine === "sqlserver" ? migration.sqlserver : migration.postgresql;
            await history.applyAndRecord(migration, sql, migrationChecksum(engine, migration));
            completed.push(migration.id);
        }
        return completed;
    });
}

/**
 * Adapter for stores that execute DDL and history recording inside a single
 * externally managed transaction. Does not itself implement transactions.
 */
export function createMigrationHistoryExecutor(
    readApplied: () => Promise<AppliedMigrationRecord[]>,
    applyAndRecord: (migration: DatabaseMigration, sql: string, checksum: string) => Promise<void>,
    withExclusiveLock: <T>(work: () => Promise<T>) => Promise<T>
): MigrationHistoryStore {
    return { readApplied, applyAndRecord, withExclusiveLock };
}
