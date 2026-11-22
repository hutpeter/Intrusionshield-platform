import { createWithinDistanceQuery } from "../../dialects/SpatialQuery.js";
import { PostgreSqlMigrationHistoryStore } from "../../migrations/PostgreSqlMigrationHistoryStore.js";
import { runVersionedMigrations } from "../../migrations/VersionedMigrationRunner.js";
import { PostgreSqlDialect } from "../../dialects/DatabaseDialect.js";
import { TenantDatabaseAccess } from "../TenantDatabaseAccess.js";
import { describe, expect, test } from "@jest/globals";
import { PostgreSqlProvider } from "../PostgreSqlProvider.js";
import { createTenantScopedDatabaseProvider } from "../createDatabaseProvider.js";

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
    liveTest("tenant-scoped queries cannot read another tenant's records", async () => {
        const db = new PostgreSqlProvider(options);
        await db.connect();
        const table = "ruby_portability_tenant_isolation";
        try {
            await db.execute(`CREATE TABLE IF NOT EXISTS ${table} (tenant_id text NOT NULL, record_id text NOT NULL, PRIMARY KEY (tenant_id, record_id))`);
            await db.execute(`DELETE FROM ${table}`);
            await db.execute(`INSERT INTO ${table} (tenant_id, record_id) VALUES ($1, $2), ($3, $4)`, [
                { name: "p0", value: "tenant-a" }, { name: "p1", value: "a-only" },
                { name: "p2", value: "tenant-b" }, { name: "p3", value: "b-only" }
            ]);
            const readTenant = async (tenantId: string) => db.query<{ record_id: string }>(
                `SELECT record_id FROM ${table} WHERE tenant_id = $1 ORDER BY record_id`,
                [{ name: "p0", value: tenantId }]
            );
            const [tenantA, tenantB] = await Promise.all([readTenant("tenant-a"), readTenant("tenant-b")]);
            expect(tenantA.rows).toEqual([{ record_id: "a-only" }]);
            expect(tenantB.rows).toEqual([{ record_id: "b-only" }]);
            const crossTenant = await db.query<{ record_id: string }>(
                `SELECT record_id FROM ${table} WHERE tenant_id = $1 AND record_id = $2`,
                [{ name: "p0", value: "tenant-a" }, { name: "p1", value: "b-only" }]
            );
            expect(crossTenant.rows).toEqual([]);
        } finally {
            try { await db.execute(`DROP TABLE IF EXISTS ${table}`); }
            finally { await db.disconnect(); }
        }
    });

    liveTest("PostgreSQL row-level security enforces tenant isolation within scoped transactions", async () => {
        const db = new PostgreSqlProvider(options);
        await db.connect();
        const table = "ruby_portability_rls_test";
        try {
            await db.execute(`CREATE TABLE IF NOT EXISTS ${table} (tenant_id text NOT NULL, record_id text NOT NULL)`);
            await db.execute(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
            await db.execute(`DELETE FROM ${table}`);
            await db.execute(`INSERT INTO ${table} (tenant_id, record_id) VALUES ('tenant-a', 'a-only'), ('tenant-b', 'b-only')`);
            await db.execute(`DROP POLICY IF EXISTS ruby_tenant_policy ON ${table}`);
            await db.execute(`CREATE POLICY ruby_tenant_policy ON ${table} USING (tenant_id = current_setting('ruby.tenant_id', true)) WITH CHECK (tenant_id = current_setting('ruby.tenant_id', true))`);
            await db.execute(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
            await db.execute(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            const readTenant = (tenant: string) => db.withTenantTransaction(tenant, async tx => {
                return (await tx.query<{ record_id: string }>(`SELECT record_id FROM ${table} ORDER BY record_id`)).rows;
            });
            const [a, b] = await Promise.all([readTenant("tenant-a"), readTenant("tenant-b")]);
            expect(a).toEqual([{ record_id: "a-only" }]);
            expect(b).toEqual([{ record_id: "b-only" }]);
            await expect(db.withTenantTransaction("tenant-a", async tx => {
                await tx.execute(`INSERT INTO ${table} (tenant_id, record_id) VALUES ('tenant-b', 'forbidden')`);
            })).rejects.toThrow();
            const rows = await db.withTenantTransaction("tenant-b", async tx => {
                return (await tx.query<{ record_id: string }>(`SELECT record_id FROM ${table} ORDER BY record_id`)).rows;
            });
            expect(rows).toEqual([{ record_id: "b-only" }]);
        } finally {
            try {
                await db.execute(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
                await db.execute(`DROP TABLE IF EXISTS ${table}`);
            } finally { await db.disconnect(); }
        }
    });

    liveTest("tenant context is required and does not leak after transaction completion", async () => {
        const db = createTenantScopedDatabaseProvider({ engine: "postgresql", options });
        await db.connect();
        try {
            await expect(db.withTenantTransaction("", async () => undefined)).rejects.toThrow("tenant identifier");
            const inside = await db.withTenantTransaction("tenant-a", async tx =>
                (await tx.query<{ tenant_id: string }>("SELECT current_setting('ruby.tenant_id', true) AS tenant_id")).rows[0]?.tenant_id
            );
            expect(inside).toBe("tenant-a");
            const outside = await db.query<{ tenant_id: string | null }>("SELECT current_setting('ruby.tenant_id', true) AS tenant_id");
            expect(outside.rows[0]?.tenant_id ?? "").toBe("");
            const second = await db.withTenantTransaction("tenant-b", async tx =>
                (await tx.query<{ tenant_id: string }>("SELECT current_setting('ruby.tenant_id', true) AS tenant_id")).rows[0]?.tenant_id
            );
            expect(second).toBe("tenant-b");
        } finally { await db.disconnect(); }
    });

    liveTest("tenant-only facade uses real postgresql provider", async () => {
        const db = createTenantScopedDatabaseProvider({ engine: "postgresql", options });
        await db.connect();
        try {
            const access = new TenantDatabaseAccess(db);
            const result = await access.forTenant("tenant-a", session => session.query<{ ok: number }>("SELECT 1 AS ok"));
            expect(result.rows[0]?.ok).toBe(1);
            await expect(access.forTenant("", session => session.query("SELECT 1"))).rejects.toThrow("tenant identifier");
        } finally { await db.disconnect(); }
    });

    liveTest("WGS84 distance predicate executes against PostGIS geography", async () => {
        const db = createTenantScopedDatabaseProvider({ engine: "postgresql", options });
        await db.connect();
        try {
            const predicate = createWithinDistanceQuery(new PostgreSqlDialect(), "location", { latitude: 45.0001, longitude: -75.0 }, 100);
            const result = await db.query<{ nearby: boolean }>(
                `SELECT ${predicate.sql} AS nearby FROM (SELECT ST_SetSRID(ST_MakePoint(-75.0, 45.0), 4326)::geography AS location) AS site`,
                [...predicate.parameters]
            );
            expect(result.rows[0]?.nearby).toBe(true);
        } finally { await db.disconnect(); }
    });

    (process.env.RUBY_TEST_MIGRATION_HISTORY === "1" ? liveTest : test.skip)("durable PostgreSQL migration history, idempotence and rollback", async () => {
        const db = new PostgreSqlProvider(options);
        await db.connect();
        const store = new PostgreSqlMigrationHistoryStore(db);
        const suffix = Math.random().toString(36).slice(2, 10);
        const id = `migration_${suffix}`;
        const table = `ruby_migration_test_${suffix}`;
        const migration = { id, description: "integration", sqlserver: "SELECT 1", postgresql: `CREATE TABLE ${table} (id integer NOT NULL)` };
        try {
            await db.execute("DROP TABLE IF EXISTS ruby_schema_migrations");
            expect(await runVersionedMigrations("postgresql", [migration], store)).toEqual([id]);
            expect(await runVersionedMigrations("postgresql", [migration], store)).toEqual([]);
            // Two deployment attempts must serialize and apply the new migration only once.
            const concurrent = { id: `concurrent_${suffix}`, description: "concurrency", sqlserver: "SELECT 1", postgresql: "SELECT 1" };
            const outcomes = await Promise.all([
                runVersionedMigrations("postgresql", [migration, concurrent], store),
                runVersionedMigrations("postgresql", [migration, concurrent], store)
            ]);
            expect(outcomes.flat()).toEqual([concurrent.id]);
            await expect(runVersionedMigrations("postgresql", [{ ...migration, postgresql: "SELECT 2" }], store)).rejects.toThrow("checksum drift");
            const failing = { id: `failed_${suffix}`, description: "invalid", sqlserver: "SELECT 1", postgresql: "SELECT * FROM ruby_table_that_does_not_exist" };
            await expect(runVersionedMigrations("postgresql", [migration, concurrent, failing], store)).rejects.toThrow();
            const history = await db.query<{ migration_id: string }>("SELECT migration_id FROM ruby_schema_migrations ORDER BY sequence_number");
            expect(history.rows.map(row => row.migration_id)).toEqual([id, concurrent.id]);
        } finally {
            await db.execute(`DROP TABLE IF EXISTS ${table}`);
            await db.execute("DROP TABLE IF EXISTS ruby_schema_migrations");
            await db.disconnect();
        }
    });

});
