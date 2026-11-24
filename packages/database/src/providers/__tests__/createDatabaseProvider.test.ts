import { describe, expect, test } from "@jest/globals";
import { createDatabaseProvider, createTenantScopedDatabaseProvider } from "../createDatabaseProvider.js";
import { PostgreSqlProvider } from "../PostgreSqlProvider.js";
import { SqlServerProvider } from "../SqlServerProvider.js";

describe("database provider factory", () => {
    test("selects SQL Server without connecting", () => {
        const provider = createDatabaseProvider({
            engine: "sqlserver",
            options: { server: "localhost", port: 1433, database: "ruby", user: "test", password: "test", encrypt: true, trustServerCertificate: false }
        });
        expect(provider).toBeInstanceOf(SqlServerProvider);
        expect(provider.isConnected()).toBe(false);
    });

    test("selects PostgreSQL without connecting", () => {
        const provider = createDatabaseProvider({
            engine: "postgresql",
            options: { host: "localhost", port: 5432, database: "ruby", user: "test", password: "test" }
        });
        expect(provider).toBeInstanceOf(PostgreSqlProvider);
        expect(provider.isConnected()).toBe(false);
    });

    test("tenant-scoped factory selects both engines and rejects unknown runtime engines", () => {
        expect(createTenantScopedDatabaseProvider({ engine: "sqlserver", options: { server: "localhost", port: 1433, database: "ruby", user: "test", password: "test", encrypt: true, trustServerCertificate: false } })).toBeInstanceOf(SqlServerProvider);
        expect(createTenantScopedDatabaseProvider({ engine: "postgresql", options: { host: "localhost", port: 5432, database: "ruby", user: "test", password: "test" } })).toBeInstanceOf(PostgreSqlProvider);
        const invalid = { engine: "sqlite", options: {} } as never;
        expect(() => createDatabaseProvider(invalid)).toThrow("Unsupported database engine: sqlite");
        expect(() => createTenantScopedDatabaseProvider(invalid)).toThrow("Unsupported database engine: sqlite");
    });

    test("rejects queries before connecting", async () => {
        const provider = new PostgreSqlProvider({ host: "localhost", port: 5432, database: "ruby", user: "test", password: "test" });
        await expect(provider.query("SELECT 1")).rejects.toThrow("Database connection has not been established.");
        await expect(provider.beginTransaction()).rejects.toThrow("Database connection has not been established.");
    });
});
