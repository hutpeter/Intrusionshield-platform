import { describe, expect, test } from "@jest/globals";
import { createTenantScopedDatabaseProvider } from "../createDatabaseProvider.js";

const enabled = Boolean(process.env.RUBY_TEST_SQLSERVER_HOST);
const liveTest = enabled ? test : test.skip;
const options = {
    server: process.env.RUBY_TEST_SQLSERVER_HOST ?? "localhost",
    port: Number(process.env.RUBY_TEST_SQLSERVER_PORT ?? "1433"),
    database: process.env.RUBY_TEST_SQLSERVER_DB ?? "master",
    user: process.env.RUBY_TEST_SQLSERVER_USER ?? "sa",
    password: process.env.RUBY_TEST_SQLSERVER_PASSWORD ?? "",
    encrypt: false,
    trustServerCertificate: true
};

describe("live SQL Server tenant-scoped transactions", () => {
    liveTest("tenant context, concurrent requests, cleanup, and rollback", async () => {
        const db = createTenantScopedDatabaseProvider({ engine: "sqlserver", options });
        await db.connect();
        try {
            await expect(db.withTenantTransaction("", async () => undefined)).rejects.toThrow("tenant identifier");
            const readTenant = (tenant: string) => db.withTenantTransaction(tenant, async tx => {
                const result = await tx.query<{ tenant_id: string }>(
                    "SELECT CONVERT(nvarchar(128), SESSION_CONTEXT(N'ruby.tenant_id')) AS tenant_id"
                );
                return result.rows[0]?.tenant_id;
            });
            const [a, b] = await Promise.all([readTenant("tenant-a"), readTenant("tenant-b")]);
            expect(a).toBe("tenant-a");
            expect(b).toBe("tenant-b");
            await expect(db.withTenantTransaction("tenant-a", async tx => {
                await tx.query("SELECT 1 AS ok");
                throw new Error("intentional rollback");
            })).rejects.toThrow("intentional rollback");
            expect(await readTenant("tenant-b")).toBe("tenant-b");
            const outside = await db.query<{ tenant_id: string | null }>(
                "SELECT CONVERT(nvarchar(128), SESSION_CONTEXT(N'ruby.tenant_id')) AS tenant_id"
            );
            expect(outside.rows[0]?.tenant_id).toBeNull();
        } finally { await db.disconnect(); }
    });
});
