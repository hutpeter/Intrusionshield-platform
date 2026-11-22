import type { DatabaseOptions } from "../DatabaseOptions.js";
import type { IDatabaseProvider, ITenantScopedDatabaseProvider } from "./IDatabaseProvider.js";
import { SqlServerProvider } from "./SqlServerProvider.js";
import { PostgreSqlProvider, type PostgreSqlOptions } from "./PostgreSqlProvider.js";

/** Explicit engine selection, while legacy SQL Server callers remain unchanged. */
export type DatabaseProviderConfiguration =
    | { engine: "sqlserver"; options: DatabaseOptions }
    | { engine: "postgresql"; options: PostgreSqlOptions };

export function createDatabaseProvider(config: DatabaseProviderConfiguration): IDatabaseProvider {
    switch (config.engine) {
        case "sqlserver": return new SqlServerProvider(config.options);
        case "postgresql": return new PostgreSqlProvider(config.options);
        default: {
            throw new Error(`Unsupported database engine: ${String((config as { engine: unknown }).engine)}`);
        }
    }
}

/** Select either engine while preserving tenant-scoped transaction support. */
export function createTenantScopedDatabaseProvider(config: DatabaseProviderConfiguration): ITenantScopedDatabaseProvider {
    switch (config.engine) {
        case "sqlserver": return new SqlServerProvider(config.options);
        case "postgresql": return new PostgreSqlProvider(config.options);
        default: throw new Error(`Unsupported database engine: ${String((config as { engine: unknown }).engine)}`);
    }
}
