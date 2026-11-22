import { describe, expect, test } from "@jest/globals";
import { PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";
import { createWgs84PointColumnSql, createWgs84PointCheckSql } from "../SpatialColumn.js";

describe("portable WGS84 point column declaration", () => {
    test("SQL Server geography declaration", () => {
        expect(createWgs84PointColumnSql(new SqlServerDialect(), "site_location")).toBe("[site_location] geography NOT NULL");
        expect(createWgs84PointColumnSql(new SqlServerDialect(), "site_location", true)).toBe("[site_location] geography NULL");
    });
    test("PostGIS geography Point typmod enforces WGS84 and point type", () => {
        expect(createWgs84PointColumnSql(new PostgreSqlDialect(), "site_location")).toBe('"site_location" geography(Point,4326) NOT NULL');
        expect(createWgs84PointColumnSql(new PostgreSqlDialect(), "site_location", true)).toBe('"site_location" geography(Point,4326) NULL');
    });
    test("SQL Server CHECK enforces WGS84 point type and nullable semantics", () => {
        const dialect = new SqlServerDialect();
        expect(createWgs84PointCheckSql(dialect, "site_location")).toContain(".STSrid = 4326");
        expect(createWgs84PointCheckSql(dialect, "site_location")).toContain(".STGeometryType() = 'Point'");
        expect(createWgs84PointCheckSql(dialect, "site_location")).toContain(".STIsEmpty() = 0");
        expect(createWgs84PointCheckSql(dialect, "site_location", true)).toContain("[site_location] IS NULL OR");
        expect(createWgs84PointCheckSql(new PostgreSqlDialect(), "site_location")).toBe("TRUE");
    });
    test("rejects untrusted, overlong and unsupported inputs", () => {
        expect(() => createWgs84PointColumnSql(new SqlServerDialect(), "x);DROP TABLE y")).toThrow("safe SQL");
        expect(() => createWgs84PointColumnSql(new PostgreSqlDialect(), "x".repeat(64))).toThrow("safe SQL");
        expect(() => createWgs84PointColumnSql({ ...new SqlServerDialect(), engine: "sqlite" } as never, "point")).toThrow("Unsupported spatial column");
        expect(() => createWgs84PointCheckSql({ ...new SqlServerDialect(), engine: "sqlite" } as never, "point")).toThrow("Unsupported spatial column");
    });
});
