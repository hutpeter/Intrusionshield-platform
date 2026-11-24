import { describe, expect, test } from "@jest/globals";
import { createDatabaseDialect, PostgreSqlDialect, SqlServerDialect } from "../DatabaseDialect.js";

describe("database dialect selection", () => {
    test("selects the correct SQL dialect", () => {
        expect(createDatabaseDialect("sqlserver")).toBeInstanceOf(SqlServerDialect);
        expect(createDatabaseDialect("postgresql")).toBeInstanceOf(PostgreSqlDialect);
    });
    test("rejects unsupported engines at runtime", () => {
        expect(() => createDatabaseDialect("sqlite" as never)).toThrow("Unsupported database engine: sqlite");
    });
});
