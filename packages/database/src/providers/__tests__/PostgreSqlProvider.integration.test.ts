import { describe, expect, test } from "@jest/globals";
import { PostgreSqlProvider } from "../PostgreSqlProvider.js";

const configured = Boolean(process.env.RUBY_TEST_POSTGRES_HOST);
const liveTest = configured ? test : test.skip;
const options = {
    host: process.env.RUBY_TEST_POSTGRES_HOST ?? "localhost",
    port: Number(process.env.RUBY_TEST_POSTGRES_PORT ?? "5432"),
    database: process.env.RUBY_TEST_POSTGRES_DB ?? "ruby_portability_test",
    user: process.env.RUBY_TEST_POSTGRES_USER ?? "ruby_test",
    password: process.env.RUBY_TEST_POSTGRES_PASSWORD ?? ""
};

/** Live tests run only when explicit PostgreSQL test configuration is provided. */
describe("live PostgreSQL / PostGIS portability", () => {
    liveTest("parameterized queries, rollback, concurrency, and PostGIS", async () => {
        const db = new PostgreSqlProvider(options);
        await db.connect();
        try {
            await db.execute("CREATE EXTENSION IF NOT EXISTS postgis");
            await db.execute("CREATE TEMP TABLE ruby_test_rows (tenant_id text NOT NULL, value text NOT NULL)");
            // Temporary tables are connection-local; use a regular unique table for pooled requests.
            const table = "ruby_portability_integration_rows";
            await db.execute(`CREATE TABLE IF NOT EXISTS ${table} (tenant_id text NOT NULL, value text NOT NULL)`);
            try {
                await db.execute(`DELETE FROM ${table}`);
                await db.withTransaction(async tx => {
                    await tx.execute(`INSERT INTO ${table} (tenant_id, value) VALUES ($1, $2)`, [
                        { name: "p0", value: "tenant-a" }, { name: "p1", value: "committed" }
                    ]);
                });
                await expect(db.withTransaction(async tx => {
                    await tx.execute(`INSERT INTO ${table} (tenant_id, value) VALUES ($1, $2)`, [
                        { name: "p0", value: "tenant-b" }, { name: "p1", value: "rolled-back" }
                    ]);
                    throw new Error("rollback test");
                })).rejects.toThrow("rollback test");
                const rows = await db.query<{ tenant_id: string; value: string }>(`SELECT tenant_id, value FROM ${table} ORDER BY tenant_id`);
                expect(rows.rows).toEqual([{ tenant_id: "tenant-a", value: "committed" }]);
                const [a, b] = await Promise.all([
                    db.withTransaction(async tx => (await tx.query<{ n: number }>("SELECT 1 AS n")).rows[0]?.n),
                    db.withTransaction(async tx => (await tx.query<{ n: number }>("SELECT 2 AS n")).rows[0]?.n)
                ]);
                expect([a, b]).toEqual([1, 2]);
                const geo = await db.query<{ nearby: boolean }>(
                    "SELECT ST_DWithin(ST_SetSRID(ST_MakePoint(-75.7, 45.4), 4326)::geography, ST_SetSRID(ST_MakePoint(-75.7, 45.4), 4326)::geography, 100) AS nearby"
                );
                expect(geo.rows[0]?.nearby).toBe(true);
            } finally {
                await db.execute(`DROP TABLE IF EXISTS ${table}`);
            }
        } finally {
            await db.disconnect();
        }
    });
});
