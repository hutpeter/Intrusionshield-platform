import { describe, expect, test } from "@jest/globals";
import { PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";
import { pointInAreaPredicate, spatialRelationPredicate } from "../SpatialRelations.js";

describe("cross-engine geography relationships", () => {
    test("SQL Server containment and intersection", () => {
        const dialect = new SqlServerDialect();
        expect(() => spatialRelationPredicate(dialect, "area", "location", "contains"))
            .toThrow("point-in-area adapter");
        expect(spatialRelationPredicate(dialect, "area", "location", "intersects"))
            .toBe("([area].STIntersects([location]) = 1)");
    });
    test("PostGIS containment and intersection", () => {
        const dialect = new PostgreSqlDialect();
        expect(spatialRelationPredicate(dialect, "area", "location", "contains"))
            .toBe('ST_Contains("area"::geometry, "location"::geometry)');
        expect(spatialRelationPredicate(dialect, "area", "location", "intersects"))
            .toBe('ST_Intersects("area", "location")');
    });
    test("point-in-area uses geography intersection on both engines", () => {
        expect(pointInAreaPredicate(new SqlServerDialect(), "area", "point"))
            .toBe("([area].STIntersects([point]) = 1)");
        expect(pointInAreaPredicate(new PostgreSqlDialect(), "area", "point"))
            .toBe('ST_Intersects("area", "point")');
    });
    test("rejects unsafe columns and unknown relations", () => {
        const dialect = new SqlServerDialect();
        expect(() => spatialRelationPredicate(dialect, "area);DROP TABLE x", "location", "contains")).toThrow("safe SQL");
        expect(() => spatialRelationPredicate(dialect, "x".repeat(64), "location", "intersects")).toThrow("safe SQL");
        expect(() => spatialRelationPredicate(dialect, "area", "location", "overlaps" as "contains")).toThrow("Unsupported");
    });
});
