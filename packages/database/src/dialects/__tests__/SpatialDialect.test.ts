import { describe, expect, test } from "@jest/globals";
import { PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";
import { withinDistancePredicate } from "../SpatialDialect.js";

describe("WGS84 spatial distance SQL", () => {
    test("SQL Server uses geography::Point latitude-first and metres", () => {
        expect(withinDistancePredicate(new SqlServerDialect(), "location", "@p0", "@p1", "@p2"))
            .toBe("([location].STDistance(geography::Point(@p0, @p1, 4326)) <= @p2)");
    });
    test("PostGIS uses longitude-first point and geography metres", () => {
        expect(withinDistancePredicate(new PostgreSqlDialect(), "location", "$1", "$2", "$3"))
            .toBe('ST_DWithin("location", ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)');
    });
    test("escapes geography column identifier", () => {
        expect(withinDistancePredicate(new PostgreSqlDialect(), 'loc"ation', "$1", "$2", "$3"))
            .toContain('"loc""ation"');
    });
});
