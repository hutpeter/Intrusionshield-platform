import { describe, expect, test } from "@jest/globals";
import { migrationChecksum, planDatabaseMigrations } from "../MigrationPlan.js";

const first = { id: "001", description: "first", sqlserver: "SELECT 1", postgresql: "SELECT 1::int" };
const second = { id: "002", description: "second", sqlserver: "SELECT 2", postgresql: "SELECT 2::int" };

describe("migration plan and drift checks", () => {
    test("returns only pending suffix", () => {
        expect(planDatabaseMigrations("postgresql", [first, second], [{ id: first.id, checksum: migrationChecksum("postgresql", first) }])).toEqual([second]);
    });
    test("rejects changed previously applied SQL", () => {
        expect(() => planDatabaseMigrations("postgresql", [first], [{ id: "001", checksum: "invalid" }])).toThrow("checksum drift");
    });
    test("rejects gaps in applied migration history", () => {
        expect(() => planDatabaseMigrations("sqlserver", [first, second], [{ id: "002", checksum: migrationChecksum("sqlserver", second) }])).toThrow("appears after a pending");
    });
    test("rejects deleted history and duplicate IDs", () => {
        expect(() => planDatabaseMigrations("sqlserver", [first], [{ id: "000", checksum: "a" }])).toThrow("missing");
        expect(() => planDatabaseMigrations("sqlserver", [first, first], [])).toThrow("duplicate");
    });
    test("rejects history recorded in the wrong order", () => {
        expect(() => planDatabaseMigrations("sqlserver", [first, second], [
            { id: "002", checksum: migrationChecksum("sqlserver", second) },
            { id: "001", checksum: migrationChecksum("sqlserver", first) }
        ])).toThrow("order mismatch");
    });
    test("uses provider-specific SQL to calculate checksums", () => {
        expect(migrationChecksum("sqlserver", first)).not.toBe(migrationChecksum("postgresql", first));
    });
});
