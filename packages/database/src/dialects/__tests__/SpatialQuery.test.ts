import { describe, expect, test } from "@jest/globals";
import { PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";
import { createWithinDistanceQuery } from "../SpatialQuery.js";

const point = { latitude: 45.4, longitude: -75.7 };
describe("portable spatial query builder", () => {
    test("binds SQL Server WGS84 coordinates and distance", () => {
        const result = createWithinDistanceQuery(new SqlServerDialect(), "location", point, 100);
        expect(result.sql).toContain("geography::Point(@p0, @p1, 4326)");
        expect(result.sql).toContain("<= @p2");
        expect(result.parameters.map(p => p.value)).toEqual([45.4, -75.7, 100]);
    });
    test("binds PostGIS WGS84 coordinates with PostgreSQL placeholders", () => {
        const result = createWithinDistanceQuery(new PostgreSqlDialect(), "location", point, 100, 2);
        expect(result.sql).toContain("ST_MakePoint($4, $3)");
        expect(result.sql).toContain(", $5)");
        expect(result.parameters.map(p => p.name)).toEqual(["p2", "p3", "p4"]);
    });
    test("rejects unsupported engine before emitting SQL", () => {
        const unsupported = { ...new SqlServerDialect(), engine: "sqlite" } as unknown as SqlServerDialect;
        expect(() => createWithinDistanceQuery(unsupported, "location", point, 100)).toThrow("Unsupported spatial query");
    });
    test("rejects invalid coordinates, radii, and offsets", () => {
        const dialect = new SqlServerDialect();
        expect(() => createWithinDistanceQuery(dialect, "location", { latitude: 91, longitude: 0 }, 10)).toThrow("latitude");
        expect(() => createWithinDistanceQuery(dialect, "location", { latitude: 0, longitude: Infinity }, 10)).toThrow("longitude");
        expect(() => createWithinDistanceQuery(dialect, "location", point, -1)).toThrow("Distance");
        expect(() => createWithinDistanceQuery(dialect, "location", point, NaN)).toThrow("Distance");
        expect(() => createWithinDistanceQuery(dialect, "location", point, 1, -1)).toThrow("offset");
        expect(() => createWithinDistanceQuery(dialect, "dbo.location", point, 1)).toThrow("safe SQL identifier");
        expect(() => createWithinDistanceQuery(dialect, "location]; DROP TABLE patients;--", point, 1)).toThrow("safe SQL identifier");
        expect(() => createWithinDistanceQuery(dialect, "location", point, 1, Number.MAX_SAFE_INTEGER)).toThrow("offset");
    });
});
