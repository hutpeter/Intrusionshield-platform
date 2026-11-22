import { createHash } from "node:crypto";
import type { DatabaseEngine } from "../dialects/DatabaseDialect.js";
import type { DatabaseMigration } from "./DatabaseMigration.js";

/** A recorded migration identity and digest, loaded from deployment history. */
export interface AppliedMigrationRecord {
    readonly id: string;
    readonly checksum: string;
}

/** Immutable migration plan with checksum drift detection. */
export function planDatabaseMigrations(
    engine: DatabaseEngine,
    migrations: readonly DatabaseMigration[],
    applied: readonly AppliedMigrationRecord[]
): DatabaseMigration[] {
    if (engine !== "sqlserver" && engine !== "postgresql") throw new Error("Unsupported database engine.");
    const seen = new Set<string>();
    const history = new Map<string, string>();
    for (const record of applied) {
        if (history.has(record.id)) throw new Error(`Duplicate applied migration ${record.id}`);
        history.set(record.id, record.checksum);
    }
    const pending: DatabaseMigration[] = [];
    // Compare history in exact deployment order, not merely as a set of IDs.
    let appliedIndex = 0;
    let encounteredPending = false;
    for (const migration of migrations) {
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(migration.id) || seen.has(migration.id)) {
            throw new Error(`Invalid or duplicate migration ID: ${migration.id}`);
        }
        seen.add(migration.id);
        const sql = engine === "sqlserver" ? migration.sqlserver : migration.postgresql;
        if (!sql.trim()) throw new Error(`Missing ${engine} SQL for migration ${migration.id}`);
        const checksum = createHash("sha256").update(sql).digest("hex");
        const previous = history.get(migration.id);
        if (previous !== undefined) {
            if (applied[appliedIndex]?.id !== migration.id) throw new Error(`Applied migration order mismatch: ${migration.id}`);
            appliedIndex++;
            if (encounteredPending) throw new Error(`Applied migration ${migration.id} appears after a pending migration`);
            if (previous !== checksum) throw new Error(`Migration checksum drift: ${migration.id}`);
        } else {
            encounteredPending = true;
            pending.push(migration);
        }
    }
    for (const id of history.keys()) {
        if (!seen.has(id)) throw new Error(`Previously applied migration is missing: ${id}`);
    }
    return pending;
}

export function migrationChecksum(engine: DatabaseEngine, migration: DatabaseMigration): string {
    return createHash("sha256").update(engine === "sqlserver" ? migration.sqlserver : migration.postgresql).digest("hex");
}
