export type { DatabaseOptions } from "./DatabaseOptions.js";
export { DatabaseManager } from "./DatabaseManager.js";
export type { IDatabaseContext } from "./IDatabaseContext.js";
export { QueryExecutor } from "./QueryExecutor.js";
export type { SqlParameter } from "./SqlParameter.js";
export type { SqlResult } from "./SqlResult.js";

export {
    createUuid,
    isUuid,
    normalizeDatabaseValue,
    normalizeUuid
} from "./Uuid.js";

export type { IDatabaseProvider, ITenantScopedDatabaseProvider } from "./providers/IDatabaseProvider.js";
export { SqlServerProvider } from "./providers/SqlServerProvider.js";

export type { QueryOperator } from "./query/QueryOperator.js";
export type { QueryParameter } from "./query/QueryParameter.js";
export { SelectQueryBuilder } from "./query/SelectQueryBuilder.js";
export type { SqlCommand } from "./query/SqlCommand.js";
export { resolveDatabaseRoleConfiguration } from "./DatabaseRoleConfiguration.js";
export type { RubyDatabaseRole, DatabaseRoleResolution } from "./DatabaseRoleConfiguration.js";

export { SqlServerDialect, PostgreSqlDialect, createDatabaseDialect } from "./dialects/index.js";
export type { DatabaseDialect, DatabaseEngine } from "./dialects/index.js";

export { PostgreSqlProvider } from "./providers/PostgreSqlProvider.js";
export type { PostgreSqlOptions } from "./providers/PostgreSqlProvider.js";

export { createDatabaseProvider, createTenantScopedDatabaseProvider } from "./providers/createDatabaseProvider.js";
export type { DatabaseProviderConfiguration } from "./providers/createDatabaseProvider.js";

export { TenantDatabaseAccess } from "./providers/TenantDatabaseAccess.js";
export type { TenantDatabaseSession } from "./providers/TenantDatabaseAccess.js";

export { withinDistancePredicate } from "./dialects/SpatialDialect.js";

export { applyDatabaseMigrations } from "./migrations/DatabaseMigration.js";
export type { DatabaseMigration } from "./migrations/DatabaseMigration.js";

export { planDatabaseMigrations, migrationChecksum } from "./migrations/MigrationPlan.js";
export type { AppliedMigrationRecord } from "./migrations/MigrationPlan.js";

export { runVersionedMigrations, createMigrationHistoryExecutor } from "./migrations/VersionedMigrationRunner.js";
export type { MigrationHistoryStore } from "./migrations/VersionedMigrationRunner.js";

export { SqlServerMigrationHistoryStore } from "./migrations/SqlServerMigrationHistoryStore.js";

export { PostgreSqlMigrationHistoryStore } from "./migrations/PostgreSqlMigrationHistoryStore.js";

export { validateGeoPoint, validateDistanceMetres } from "./dialects/GeoPoint.js";
export type { GeoPoint } from "./dialects/GeoPoint.js";
export { createWithinDistanceQuery } from "./dialects/SpatialQuery.js";
export type { SpatialPredicate } from "./dialects/SpatialQuery.js";
