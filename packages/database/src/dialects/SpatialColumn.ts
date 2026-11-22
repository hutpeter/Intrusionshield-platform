import type { DatabaseDialect } from "./DatabaseDialect.js";

/**
 * Provider-neutral WGS84 point storage column declaration for reviewed DDL.
 * SQL Server geography stores SRID per value without restricting it to 4326; PostgreSQL geography
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
    if (dialect.engine !== "sqlserver" && dialect.engine !== "postgresql") {
        throw new Error("Unsupported spatial column database engine.");
    }
    const name = dialect.quoteIdentifier(columnName);
    const nullSql = nullable ? "NULL" : "NOT NULL";
    if (dialect.engine === "sqlserver") return `${name} geography ${nullSql}`;
    if (dialect.engine === "postgresql") return `${name} geography(Point,4326) ${nullSql}`;
    throw new Error("Unsupported spatial column database engine.");
}

/**
 * SQL Server CHECK expression that enforces WGS84 Point values. PostGIS
 * geography(Point,4326) enforces this at the column type level.
 * Attach the expression to a named CHECK constraint in reviewed migrations.
 * SQL Server geography STGeometryType() returns the geometry type name.
 */
export function createWgs84PointCheckSql(dialect: DatabaseDialect, columnName: string, nullable = false): string {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(columnName) || columnName.length > 63) {
        throw new Error("Spatial column must be a safe SQL identifier of at most 63 ASCII characters.");
    }
    if (dialect.engine !== "sqlserver" && dialect.engine !== "postgresql") {
        throw new Error("Unsupported spatial column database engine.");
    }
    if (dialect.engine === "postgresql") {
        // PostgreSQL type modifier is the authoritative constraint.
        return "TRUE";
    }
    const name = dialect.quoteIdentifier(columnName);
    const check = `(${name}.STSrid = 4326 AND ${name}.STGeometryType() = 'Point' AND ${name}.STIsEmpty() = 0)`;
    return nullable ? `(${name} IS NULL OR ${check})` : check;
}
