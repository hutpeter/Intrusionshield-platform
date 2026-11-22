import { SqlServerDialect } from "../../dialects/DatabaseDialect.js";
import { withinDistancePredicate } from "../../dialects/SpatialDialect.js";
import { TenantDatabaseAccess } from "../TenantDatabaseAccess.js";
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
    liveTest("row-level security blocks cross-tenant reads and writes", async () => {
        const db = createTenantScopedDatabaseProvider({ engine: "sqlserver", options });
        await db.connect();
        // Unique names prevent conflicts with concurrent CI runs against a shared server.
        const suffix = Math.random().toString(36).slice(2, 10);
        const table = `dbo.ruby_rls_${suffix}`;
        const predicate = `dbo.ruby_rls_pred_${suffix}`;
        const policy = `dbo.ruby_rls_policy_${suffix}`;
        try {
            await db.execute(`CREATE TABLE ${table} (tenant_id nvarchar(128) NOT NULL, item nvarchar(128) NOT NULL)`);
            await db.execute(`INSERT INTO ${table} (tenant_id, item) VALUES (N'tenant-a', N'alpha'), (N'tenant-b', N'beta')`);
            await db.execute(`EXEC(N'CREATE FUNCTION ${predicate}(@tenant_id nvarchar(128)) RETURNS TABLE WITH SCHEMABINDING AS RETURN SELECT 1 AS permitted WHERE @tenant_id = CONVERT(nvarchar(128), SESSION_CONTEXT(N''ruby.tenant_id''))')`);
            await db.execute(`CREATE SECURITY POLICY ${policy} ADD FILTER PREDICATE ${predicate}(tenant_id) ON ${table}, ADD BLOCK PREDICATE ${predicate}(tenant_id) ON ${table} AFTER INSERT, ADD BLOCK PREDICATE ${predicate}(tenant_id) ON ${table} AFTER UPDATE WITH (STATE = ON)`);
            const items = (tenant: string) => db.withTenantTransaction(tenant, async tx =>
                (await tx.query<{ item: string }>(`SELECT item FROM ${table} ORDER BY item`)).rows.map(row => row.item)
            );
            const [a, b] = await Promise.all([items("tenant-a"), items("tenant-b")]);
            expect(a).toEqual(["alpha"]);
            expect(b).toEqual(["beta"]);
            expect((await db.query(`SELECT item FROM ${table}`)).rows).toHaveLength(0);
            await expect(db.withTenantTransaction("tenant-a", async tx => {
                await tx.execute(`INSERT INTO ${table} (tenant_id, item) VALUES (N'tenant-b', N'forbidden')`);
            })).rejects.toThrow();
            await expect(db.withTenantTransaction("tenant-a", async tx => {
                await tx.execute(`UPDATE ${table} SET tenant_id = N\'tenant-b\' WHERE item = N\'alpha\'`);
            })).rejects.toThrow();
            expect(await items("tenant-a")).toEqual(["alpha"]);
            expect(await items("tenant-b")).toEqual(["beta"]);
        } finally {
            await db.execute(`IF EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'ruby_rls_policy_${suffix}') DROP SECURITY POLICY ${policy}`);
            await db.execute(`IF OBJECT_ID(N'${predicate}', N'IF') IS NOT NULL DROP FUNCTION ${predicate}`);
            await db.execute(`IF OBJECT_ID(N'${table}', N'U') IS NOT NULL DROP TABLE ${table}`);
            await db.disconnect();
        }
    });

    liveTest("tenant-only facade uses real sqlserver provider", async () => {
        const db = createTenantScopedDatabaseProvider({ engine: "sqlserver", options });
        await db.connect();
        try {
            const access = new TenantDatabaseAccess(db);
            const result = await access.forTenant("tenant-a", session => session.query<{ ok: number }>("SELECT 1 AS ok"));
            expect(result.rows[0]?.ok).toBe(1);
            await expect(access.forTenant("", session => session.query("SELECT 1"))).rejects.toThrow("tenant identifier");
        } finally { await db.disconnect(); }
    });

    liveTest("WGS84 distance predicate executes against SQL Server geography", async () => {
        const db = createTenantScopedDatabaseProvider({ engine: "sqlserver", options });
        await db.connect();
        try {
            const predicate = withinDistancePredicate(new SqlServerDialect(), "location", "@p0", "@p1", "@p2");
            const result = await db.query<{ nearby: number }>(
                `SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END AS nearby FROM (SELECT geography::Point(45.0, -75.0, 4326) AS location) AS site`,
                [{ name: "p0", value: 45.0001 }, { name: "p1", value: -75.0 }, { name: "p2", value: 100 }]
            );
            expect(result.rows[0]?.nearby).toBe(1);
        } finally { await db.disconnect(); }
    });

});
