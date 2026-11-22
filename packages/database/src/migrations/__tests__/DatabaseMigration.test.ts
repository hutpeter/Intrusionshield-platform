import { describe, expect, test } from "@jest/globals";
import { applyDatabaseMigrations } from "../DatabaseMigration.js";
import type { IDatabaseProvider } from "../../providers/IDatabaseProvider.js";

function fake() {
    const statements: string[] = [];
    const provider = { execute: async (sql: string) => { statements.push(sql); return 0; } } as IDatabaseProvider;
    return { provider, statements };
}
const migration = { id: "001_core", description: "test", sqlserver: "CREATE TABLE dbo.test_table (id int)", postgresql: "CREATE TABLE test_table (id integer)" };

describe("database migration SQL selection", () => {
    test("selects SQL Server DDL", async () => {
        const { provider, statements } = fake();
        expect(await applyDatabaseMigrations(provider, "sqlserver", [migration])).toEqual(["001_core"]);
        expect(statements).toEqual([migration.sqlserver]);
    });
    test("selects PostgreSQL DDL", async () => {
        const { provider, statements } = fake();
        expect(await applyDatabaseMigrations(provider, "postgresql", [migration])).toEqual(["001_core"]);
        expect(statements).toEqual([migration.postgresql]);
    });
    test("rejects duplicate or malformed IDs before running DDL", async () => {
        const { provider, statements } = fake();
        await expect(applyDatabaseMigrations(provider, "sqlserver", [migration, migration])).rejects.toThrow("unique");
        await expect(applyDatabaseMigrations(provider, "sqlserver", [{ ...migration, id: "../bad" }])).rejects.toThrow("unique");
        expect(statements).toEqual([]);
    });
    test("rejects missing SQL for selected engine", async () => {
        const { provider } = fake();
        await expect(applyDatabaseMigrations(provider, "postgresql", [{ ...migration, postgresql: " " }])).rejects.toThrow("Missing postgresql SQL");
    });
});
