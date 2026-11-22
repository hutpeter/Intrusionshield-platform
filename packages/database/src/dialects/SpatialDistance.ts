import type { DatabaseDialect } from "./DatabaseDialect.js";
import { validateGeoPoint, type GeoPoint } from "./GeoPoint.js";
import type { SqlParameter } from "../SqlParameter.js";

/** Distance in metres from a geography column to a bound WGS84 point. */
export function createDistanceExpression(
    dialect: DatabaseDialect,
    geographyColumn: string,
    point: GeoPoint,
    parameterOffset = 0
): { readonly sql: string; readonly parameters: readonly SqlParameter[] } {
    const valid = validateGeoPoint(point);
    if ((geographyColumn.length > 63 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(geographyColumn))) {
        throw new Error("Geography column must be a safe SQL identifier.");
    }
    if (!Number.isSafeInteger(parameterOffset) || parameterOffset < 0 || !Number.isSafeInteger(parameterOffset + 2)) {
        throw new RangeError("Parameter offset must be a non-negative safe integer with room for two parameters.");
    }
    const column = dialect.quoteIdentifier(geographyColumn);
    const latitude = dialect.parameter(dialect.engine === "postgresql" ? parameterOffset + 1 : parameterOffset);
    const longitude = dialect.parameter(dialect.engine === "postgresql" ? parameterOffset + 2 : parameterOffset + 1);
    let sql: string;
    if (dialect.engine === "sqlserver") {
        sql = `${column}.STDistance(geography::Point(${latitude}, ${longitude}, 4326))`;
    } else if (dialect.engine === "postgresql") {
        sql = `ST_Distance(${column}, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography)`;
    } else {
        throw new Error("Unsupported spatial distance database engine.");
    }
    return { sql, parameters: [
        { name: `p${parameterOffset}`, value: valid.latitude },
        { name: `p${parameterOffset + 1}`, value: valid.longitude }
    ] };
}
