import { describe, expect, test } from "@jest/globals";
import { PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";
import { createDistanceExpression } from "../SpatialDistance.js";

const point = { latitude: 45.4, longitude: -75.7 };
describe("portable WGS84 distance expression", () => {
    test("SQL Server geography returns distance in metres", () => {
        const result = createDistanceExpression(new SqlServerDialect(), "location", point);
        expect(result.sql).toBe("[location].STDistance(geography::Point(@p0, @p1, 4326))");
        expect(result.parameters.map(p => p.value)).toEqual([45.4, -75.7]);
    });
    test("PostGIS geography returns distance in metres with offset placeholders", () => {
        const result = createDistanceExpression(new PostgreSqlDialect(), "location", point, 2);
        expect(result.sql).toBe('ST_Distance("location", ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography)');
        expect(result.parameters.map(p => p.name)).toEqual(["p2", "p3"]);
    });
    test("rejects invalid identifiers, points, and offset overflow", () => {
        const dialect = new SqlServerDialect();
        expect(() => createDistanceExpression(dialect, "location);DROP", point)).toThrow("safe SQL");
        expect(() => createDistanceExpression(dialect, "location", { latitude: -91, longitude: 0 })).toThrow("latitude");
        expect(() => createDistanceExpression(dialect, "location", point, Number.MAX_SAFE_INTEGER)).toThrow("offset");
    });
});
