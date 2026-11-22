import { describe, expect, test } from "@jest/globals";
import { PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";
import { createWgs84PointColumnSql } from "../SpatialColumn.js";

describe("portable WGS84 point column declaration", () => {
    test("SQL Server geography declaration", () => {
        expect(createWgs84PointColumnSql(new SqlServerDialect(), "site_location")).toBe("[site_location] geography NOT NULL");
        expect(createWgs84PointColumnSql(new SqlServerDialect(), "site_location", true)).toBe("[site_location] geography NULL");
    });
    test("PostGIS geography Point typmod enforces WGS84 and point type", () => {
        expect(createWgs84PointColumnSql(new PostgreSqlDialect(), "site_location")).toBe('"site_location" geography(Point,4326) NOT NULL');
        expect(createWgs84PointColumnSql(new PostgreSqlDialect(), "site_location", true)).toBe('"site_location" geography(Point,4326) NULL');
    });
    test("rejects untrusted, overlong and unsupported inputs", () => {
        expect(() => createWgs84PointColumnSql(new SqlServerDialect(), "x);DROP TABLE y")).toThrow("safe SQL");
        expect(() => createWgs84PointColumnSql(new PostgreSqlDialect(), "x".repeat(64))).toThrow("safe SQL");
        expect(() => createWgs84PointColumnSql({ ...new SqlServerDialect(), engine: "sqlite" } as never, "point")).toThrow("Unsupported spatial column");
    });
});
