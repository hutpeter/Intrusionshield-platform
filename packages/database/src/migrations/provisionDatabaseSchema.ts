import type { DatabaseProviderConfiguration } from "../providers/createDatabaseProvider.js";
import { SqlServerProvider } from "../providers/SqlServerProvider.js";
import { PostgreSqlProvider } from "../providers/PostgreSqlProvider.js";
import { createMigrationHistoryStore } from "./createMigrationHistoryStore.js";
import { runVersionedMigrations } from "./VersionedMigrationRunner.js";
import { planDatabaseMigrations } from "./MigrationPlan.js";
import type { DatabaseMigration } from "./DatabaseMigration.js";

/** Apply a complete ordered migration manifest to an existing database.
 * Use a deployment-owned connection, never the runtime application principal.
 */
export async function provisionDatabaseSchema(
    configuration: DatabaseProviderConfiguration,
    migrations: readonly DatabaseMigration[]
): Promise<string[]> {
    planDatabaseMigrations(configuration.engine, migrations, []);
    const provider = configuration.engine === "sqlserver"
        ? new SqlServerProvider(configuration.options)
        : new PostgreSqlProvider(configuration.options);
    try {
        await provider.connect();
        return await runVersionedMigrations(
            configuration.engine,
            migrations,
            createMigrationHistoryStore(configuration.engine, provider)
        );
    } finally {
        await provider.disconnect();
    }
}
