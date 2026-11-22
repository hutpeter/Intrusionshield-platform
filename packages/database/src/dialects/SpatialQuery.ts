import type { DatabaseDialect } from "./DatabaseDialect.js";
import { validateDistanceMetres, validateGeoPoint, type GeoPoint } from "./GeoPoint.js";
import { withinDistancePredicate } from "./SpatialDialect.js";
import type { SqlParameter } from "../SqlParameter.js";

/** A portable, fully bound proximity predicate and its parameter values. */
export interface SpatialPredicate {
    readonly sql: string;
    readonly parameters: readonly SqlParameter[];
}

/**
 * Build a safe geography proximity predicate from a trusted column identifier.
 * Callers should use this API rather than interpolating coordinate values.
 * Parameter indices are zero-based for SQL Server and one-based for PostgreSQL.
 */
export function createWithinDistanceQuery(
    dialect: DatabaseDialect,
    geographyColumn: string,
    point: GeoPoint,
    metres: number,
    parameterOffset = 0
): SpatialPredicate {
    const valid = validateGeoPoint(point);
    validateDistanceMetres(metres);
    if (!Number.isSafeInteger(parameterOffset) || parameterOffset < 0 || !Number.isSafeInteger(parameterOffset + 3)) {
        throw new RangeError("Parameter offset must be a non-negative safe integer.");
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(geographyColumn)) {
        throw new Error("Geography column must be a single safe SQL identifier.");
    }
    if (dialect.engine !== "postgresql" && dialect.engine !== "sqlserver") {
        throw new Error("Unsupported spatial query database engine.");
    }
    const first = dialect.engine === "postgresql" ? parameterOffset + 1 : parameterOffset;
    const sql = withinDistancePredicate(
        dialect,
        geographyColumn,
        dialect.parameter(first),
        dialect.parameter(first + 1),
        dialect.parameter(first + 2)
    );
    return {
        sql,
        parameters: [
            { name: `p${parameterOffset}`, value: valid.latitude },
            { name: `p${parameterOffset + 1}`, value: valid.longitude },
            { name: `p${parameterOffset + 2}`, value: metres }
        ]
    };
}
