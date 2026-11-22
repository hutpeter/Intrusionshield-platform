import type { DatabaseDialect } from "./DatabaseDialect.js";

/**
 * Geography-column proximity predicate for WGS84 points and metres.
 * The caller must bind latitude, longitude and radius as parameters.
 * SQL Server and PostGIS use different spatial constructors and operators.
 */
export function withinDistancePredicate(
    dialect: DatabaseDialect,
    geographyColumn: string,
    latitudeParameter: string,
    longitudeParameter: string,
    metresParameter: string
): string {
    const column = dialect.quoteIdentifier(geographyColumn);
    if (dialect.engine === "sqlserver") {
        return `(${column}.STDistance(geography::Point(${latitudeParameter}, ${longitudeParameter}, 4326)) <= ${metresParameter})`;
    }
    return `ST_DWithin(${column}, ST_SetSRID(ST_MakePoint(${longitudeParameter}, ${latitudeParameter}), 4326)::geography, ${metresParameter})`;
}
