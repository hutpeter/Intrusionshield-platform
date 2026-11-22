import type { DatabaseDialect } from "./DatabaseDialect.js";

/**
 * Provider-neutral WGS84 point storage column declaration for reviewed DDL.
 * SQL Server geography enforces SRID per inserted value; PostgreSQL geography
 * uses a Point/4326 typmod to enforce geometry type and SRID.
 * This helper emits a column declaration, not a complete migration.
 */
export function createWgs84PointColumnSql(
    dialect: DatabaseDialect,
    columnName: string,
    nullable = false
): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(columnName) || columnName.length > 63) {
        throw new Error("Spatial column must be a safe SQL identifier of at most 63 ASCII characters.");
    }
    const name = dialect.quoteIdentifier(columnName);
    const nullSql = nullable ? "NULL" : "NOT NULL";
    if (dialect.engine === "sqlserver") return `${name} geography ${nullSql}`;
    if (dialect.engine === "postgresql") return `${name} geography(Point,4326) ${nullSql}`;
    throw new Error("Unsupported spatial column database engine.");
}
