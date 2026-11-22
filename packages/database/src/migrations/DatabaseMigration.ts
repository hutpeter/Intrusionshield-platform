import type { IDatabaseProvider } from "../providers/IDatabaseProvider.js";
import type { DatabaseEngine } from "../dialects/DatabaseDialect.js";

/** Explicit, reviewed migration for each supported engine. */
export interface DatabaseMigration {
    readonly id: string;
    readonly description: string;
    readonly sqlserver: string;
    readonly postgresql: string;
}

/**
 * Run reviewed DDL in order. Only trusted migrations may be passed here.
 * SQL Server batches must not contain GO; PostgreSQL statements must be valid
 * for execution through a single driver request.
 *
 * Use a dedicated migration principal, never the tenant-scoped application role.
 */
export async function applyDatabaseMigrations(
    provider: IDatabaseProvider,
    engine: DatabaseEngine,
    migrations: readonly DatabaseMigration[]
): Promise<string[]> {
    const applied: string[] = [];
    const seen = new Set<string>();
    for (const migration of migrations) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(migration.id) || seen.has(migration.id)) {
            throw new Error("Migration IDs must be unique and contain only letters, numbers, underscore or hyphen.");
        }
        seen.add(migration.id);
    }
    // Migration history and concurrent-deployment locking will be added before
    // this runner is used for production schema provisioning.
    for (const migration of migrations) {
        const sql = engine === "sqlserver" ? migration.sqlserver : migration.postgresql;
        if (!sql.trim()) throw new Error(`Missing ${engine} SQL for migration ${migration.id}`);
        await provider.execute(sql);
        applied.push(migration.id);
    }
    return applied;
}
