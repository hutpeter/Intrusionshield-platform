import { describe, expect, test } from "@jest/globals";
import { splitSqlServerMigrationBatches } from "../SqlServerMigrationHistoryStore.js";

describe("SQL Server versioned migration batch parsing", () => {
    test("executes existing GO-delimited DDL in original order", () => {
        expect(splitSqlServerMigrationBatches("CREATE SCHEMA [Identity];\nGO\nCREATE TABLE [Identity].[Identities](Id int);\nGO\n"))
            .toEqual(["CREATE SCHEMA [Identity];","CREATE TABLE [Identity].[Identities](Id int);"]);
    });
    test("accepts comments on GO separator lines and Windows newlines", () => {
        expect(splitSqlServerMigrationBatches("SELECT 1;\r\nGO -- first\r\nSELECT 2;"))
            .toEqual(["SELECT 1;","SELECT 2;"]);
    });
    test("does not split GO appearing in normal SQL text", () => {
        expect(splitSqlServerMigrationBatches("SELECT 'GO' AS marker;\nSELECT 1 AS GO;"))
            .toEqual(["SELECT 'GO' AS marker;\nSELECT 1 AS GO;"]);
    });
    test("rejects repeat counts and empty scripts", () => {
        expect(() => splitSqlServerMigrationBatches("SELECT 1;\nGO 2\n")).toThrow("repeat counts");
        expect(() => splitSqlServerMigrationBatches("GO\nGO\n")).toThrow("no executable batches");
    });
});
