import type { DatabaseDialect } from "./DatabaseDialect.js";

/**
 * Provider-neutral WGS84 geography index DDL. This generates a migration SQL
 * statement; it does not execute it or bypass migration history.
 */
export function createGeographyIndexSql(
    dialect: DatabaseDialect,
    table: string,
    column: string,
    indexName: string
): string {
    const validIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const segments = table.split(".");
    if (segments.length < 1 || segments.length > 2 || segments.some(part => !validIdentifier.test(part))) {
        throw new Error("Spatial table must be a safe table or schema.table identifier.");
    }
    if (!validIdentifier.test(column) || !validIdentifier.test(indexName)) {
        throw new Error("Spatial column and index names must be safe SQL identifiers.");
    }
    const qualifiedTable = segments.map(part => dialect.quoteIdentifier(part)).join(".");
    const quotedColumn = dialect.quoteIdentifier(column);
    const quotedIndex = dialect.quoteIdentifier(indexName);
    if (dialect.engine === "sqlserver") {
        return `CREATE SPATIAL INDEX ${quotedIndex} ON ${qualifiedTable} (${quotedColumn}) USING GEOGRAPHY_AUTO_GRID`;
    }
    if (dialect.engine === "postgresql") {
        return `CREATE INDEX ${quotedIndex} ON ${qualifiedTable} USING GIST (${quotedColumn})`;
    }
    throw new Error("Unsupported spatial index database engine.");
}
