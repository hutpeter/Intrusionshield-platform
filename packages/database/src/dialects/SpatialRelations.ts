import type { DatabaseDialect } from "./DatabaseDialect.js";

export type SpatialRelation = "contains" | "intersects";

/**
 * Geography relationship predicate between two trusted geography columns.
 * Both columns must use the same SRID (WGS84/4326 for Ruby's baseline).
 * No dynamic geometry values are interpolated into SQL.
 */
export function spatialRelationPredicate(
    dialect: DatabaseDialect,
    leftColumn: string,
    rightColumn: string,
    relation: SpatialRelation
): string {
    const valid = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (!valid.test(leftColumn) || !valid.test(rightColumn)) {
        throw new Error("Spatial relation columns must be safe SQL identifiers.");
    }
    if (relation !== "contains" && relation !== "intersects") {
        throw new Error("Unsupported spatial relationship.");
    }
    const left = dialect.quoteIdentifier(leftColumn);
    const right = dialect.quoteIdentifier(rightColumn);
    if (dialect.engine === "sqlserver") {
        if (relation === "contains") {
            // SQL Server geography supports STIntersects for a point-in-area test.
            // A full polygon-contains-polygon operation requires a separate adapter.
            throw new Error("SQL Server geography containment requires a point-in-area adapter.");
        }
        return `(${left}.STIntersects(${right}) = 1)`;
    }
    if (dialect.engine === "postgresql") {
        if (relation === "contains") {
            // PostGIS ST_Contains is a geometry operation; geography inputs
            // require an explicit cast. This uses planar WGS84 geometry semantics.
            return `ST_Contains(${left}::geometry, ${right}::geometry)`;
        }
        return `ST_Intersects(${left}, ${right})`;
    }
    throw new Error("Unsupported spatial relation database engine.");
}

/**
 * WGS84 point-in-area test for geography columns. The second column must
 * contain Point geography values; boundary points count as inside.
 * Both engines use geography intersection, avoiding planar cast semantics.
 */
export function pointInAreaPredicate(
    dialect: DatabaseDialect,
    areaColumn: string,
    pointColumn: string
): string {
    return spatialRelationPredicate(dialect, areaColumn, pointColumn, "intersects");
}
