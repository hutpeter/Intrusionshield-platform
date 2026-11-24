import { describe, expect, test } from "@jest/globals";
import { PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";
import { createGeographyIndexSql } from "../SpatialIndex.js";

describe("portable WGS84 geography spatial index DDL", () => {
    test("SQL Server generates a geography auto-grid spatial index", () => {
        expect(createGeographyIndexSql(new SqlServerDialect(), "core.Sites", "Location", "IX_Sites_Location"))
            .toBe("CREATE SPATIAL INDEX [IX_Sites_Location] ON [core].[Sites] ([Location]) USING GEOGRAPHY_AUTO_GRID");
    });
    test("PostGIS generates a GiST index", () => {
        expect(createGeographyIndexSql(new PostgreSqlDialect(), "core.sites", "location", "ix_sites_location"))
            .toBe('CREATE INDEX "ix_sites_location" ON "core"."sites" USING GIST ("location")');
    });
    test("rejects unsafe identifiers and unsupported multi-part names", () => {
        const dialect = new SqlServerDialect();
        expect(() => createGeographyIndexSql(dialect, "db.core.Sites", "Location", "idx")).toThrow("safe table");
        expect(() => createGeographyIndexSql(dialect, "Sites; DROP TABLE Sites", "Location", "idx")).toThrow("safe table");
        expect(() => createGeographyIndexSql(dialect, "Sites", "Location)", "idx")).toThrow("safe SQL");
        expect(() => createGeographyIndexSql(dialect, "Sites", "Location", "idx;--")).toThrow("safe SQL");
        expect(() => createGeographyIndexSql(dialect, "Sites", "Location", "i".repeat(64))).toThrow("safe SQL");
        expect(() => createGeographyIndexSql(dialect, "s".repeat(64), "Location", "idx")).toThrow("safe table");
    });
});
