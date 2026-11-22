import type { DatabaseEngine } from "../dialects/DatabaseDialect.js";
import { PostgreSqlProvider } from "../providers/PostgreSqlProvider.js";
import { SqlServerProvider } from "../providers/SqlServerProvider.js";
import { PostgreSqlMigrationHistoryStore } from "./PostgreSqlMigrationHistoryStore.js";
import { SqlServerMigrationHistoryStore } from "./SqlServerMigrationHistoryStore.js";
import type { MigrationHistoryStore } from "./VersionedMigrationRunner.js";

/** Create a durable, transaction-locked history store for the selected engine. */
export function createMigrationHistoryStore(engine: "sqlserver", provider: SqlServerProvider): SqlServerMigrationHistoryStore;
export function createMigrationHistoryStore(engine: "postgresql", provider: PostgreSqlProvider): PostgreSqlMigrationHistoryStore;
export function createMigrationHistoryStore(
    engine: DatabaseEngine,
    provider: SqlServerProvider | PostgreSqlProvider
): MigrationHistoryStore {
    if (engine === "sqlserver" && provider instanceof SqlServerProvider) {
        return new SqlServerMigrationHistoryStore(provider);
    }
    if (engine === "postgresql" && provider instanceof PostgreSqlProvider) {
        return new PostgreSqlMigrationHistoryStore(provider);
    }
    throw new Error("Migration history provider does not match the database engine.");
}
