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
        const method = relation === "contains" ? "STContains" : "STIntersects";
        return `(${left}.${method}(${right}) = 1)`;
    }
    if (dialect.engine === "postgresql") {
        const method = relation === "contains" ? "ST_Covers" : "ST_Intersects";
        // ST_Covers includes boundary points, unlike strict ST_Contains.
        return `${method}(${left}, ${right})`;
    }
    throw new Error("Unsupported spatial relation database engine.");
}
