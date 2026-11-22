import { describe, expect, test } from "@jest/globals";
import { createMigrationHistoryStore } from "../createMigrationHistoryStore.js";
import { PostgreSqlMigrationHistoryStore } from "../PostgreSqlMigrationHistoryStore.js";
import { SqlServerMigrationHistoryStore } from "../SqlServerMigrationHistoryStore.js";
import { PostgreSqlProvider } from "../../providers/PostgreSqlProvider.js";
import { SqlServerProvider } from "../../providers/SqlServerProvider.js";

const sqlserver = new SqlServerProvider({ server: "localhost", port: 1433, database: "test", user: "test", password: "test", encrypt: false, trustServerCertificate: true });
const postgres = new PostgreSqlProvider({ host: "localhost", port: 5432, database: "test", user: "test", password: "test" });

describe("migration history store factory", () => {
    test("selects the matching provider adapter without connecting", () => {
        expect(createMigrationHistoryStore("sqlserver", sqlserver)).toBeInstanceOf(SqlServerMigrationHistoryStore);
        expect(createMigrationHistoryStore("postgresql", postgres)).toBeInstanceOf(PostgreSqlMigrationHistoryStore);
    });
    test("rejects mismatched engine and provider", () => {
        expect(() => createMigrationHistoryStore("sqlserver", postgres as unknown as SqlServerProvider)).toThrow("does not match");
        expect(() => createMigrationHistoryStore("postgresql", sqlserver as unknown as PostgreSqlProvider)).toThrow("does not match");
    });
});
