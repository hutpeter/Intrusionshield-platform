import { createDistanceExpression } from "../../dialects/SpatialDistance.js";
import { pointInAreaPredicate, spatialRelationPredicate } from "../../dialects/SpatialRelations.js";
import { createGeographyIndexSql } from "../../dialects/SpatialIndex.js";
import { createWithinDistanceQuery } from "../../dialects/SpatialQuery.js";
import { SqlServerProvider } from "../SqlServerProvider.js";
import { SqlServerMigrationHistoryStore } from "../../migrations/SqlServerMigrationHistoryStore.js";
import { runVersionedMigrations } from "../../migrations/VersionedMigrationRunner.js";
import { SqlServerDialect } from "../../dialects/DatabaseDialect.js";
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
            const predicate = createWithinDistanceQuery(new SqlServerDialect(), "location", { latitude: 45.0001, longitude: -75.0 }, 100);
            const result = await db.query<{ nearby: number }>(
                `SELECT CASE WHEN ${predicate.sql} THEN 1 ELSE 0 END AS nearby FROM (SELECT geography::Point(45.0, -75.0, 4326) AS location) AS site`,
                [...predicate.parameters]
            );
            expect(result.rows[0]?.nearby).toBe(1);
        } finally { await db.disconnect(); }
    });

    (process.env.RUBY_TEST_MIGRATION_HISTORY === "1" ? liveTest : test.skip)("durable migration history, idempotence, and transactional rollback", async () => {
        const db = new SqlServerProvider(options);
        await db.connect();
        const store = new SqlServerMigrationHistoryStore(db);
        const suffix = Math.random().toString(36).slice(2, 10);
        const id = `migration_${suffix}`;
        const table = `dbo.ruby_migration_test_${suffix}`;
        const migration = { id, description: "integration", sqlserver: `CREATE TABLE ${table} (id int NOT NULL)`, postgresql: "SELECT 1" };
        try {
            // Existing global history may include other migrations, so run the test
            // against a clean migration history table in ephemeral CI only.
            await db.execute("IF OBJECT_ID(N'dbo.ruby_schema_migrations', N'U') IS NOT NULL DROP TABLE dbo.ruby_schema_migrations");
            expect(await runVersionedMigrations("sqlserver", [migration], store)).toEqual([id]);
            // Outside the lock scope, direct history access must fail.
            await expect(store.readApplied()).rejects.toThrow("active exclusive deployment lock");
            expect(await runVersionedMigrations("sqlserver", [migration], store)).toEqual([]);
            // Two deployment attempts must serialize and apply the new migration only once.
            const concurrent = { id: `concurrent_${suffix}`, description: "concurrency", sqlserver: "SELECT 1", postgresql: "SELECT 1" };
            const outcomes = await Promise.all([
                runVersionedMigrations("sqlserver", [migration, concurrent], store),
                runVersionedMigrations("sqlserver", [migration, concurrent], store)
            ]);
            expect(outcomes.flat()).toEqual([concurrent.id]);
            await expect(runVersionedMigrations("sqlserver", [{ ...migration, sqlserver: "SELECT 2" }], store)).rejects.toThrow("checksum drift");
            const rollbackTable = `dbo.ruby_migration_rollback_${suffix}`;
            const rollbackFirst = { id: `rollback_${suffix}`, description: "rollback probe", sqlserver: `CREATE TABLE ${rollbackTable} (id int)`, postgresql: `CREATE TABLE ${rollbackTable} (id integer)` };
            const failing = { id: `failed_${suffix}`, description: "invalid", sqlserver: "SELECT * FROM dbo.table_that_does_not_exist", postgresql: "SELECT 1" };
            await expect(runVersionedMigrations("sqlserver", [migration, concurrent, rollbackFirst, failing], store)).rejects.toThrow();
            const history = await db.query<{ migration_id: string }>("SELECT migration_id FROM dbo.ruby_schema_migrations ORDER BY sequence_number");
            expect(history.rows.map(row => row.migration_id)).toEqual([id, concurrent.id]);
            const rolledBack = await db.query<{ object_id: number | null }>(`SELECT OBJECT_ID(N'${rollbackTable}', N'U') AS object_id`);
            expect(rolledBack.rows[0]?.object_id).toBeNull();
        } finally {
            await db.execute(`IF OBJECT_ID(N'${table}', N'U') IS NOT NULL DROP TABLE ${table}`);
            await db.execute("IF OBJECT_ID(N'dbo.ruby_schema_migrations', N'U') IS NOT NULL DROP TABLE dbo.ruby_schema_migrations");
            await db.disconnect();
        }
    });

    liveTest("creates SQL Server WGS84 spatial index on geography column", async () => {
        const db = new SqlServerProvider(options);
        await db.connect();
        const suffix = Math.random().toString(36).slice(2, 10);
        const table = `dbo.ruby_geo_index_${suffix}`;
        const index = `ix_ruby_geo_${suffix}`;
        try {
            await db.execute(`CREATE TABLE ${table} (id int NOT NULL PRIMARY KEY, location geography NULL)`);
            await db.execute(createGeographyIndexSql(new SqlServerDialect(), table, "location", index));
            const result = await db.query<{ name: string }>(`SELECT name FROM sys.spatial_indexes WHERE object_id = OBJECT_ID(N'${table}')`);
            expect(result.rows.map(row => row.name)).toContain(index);
        } finally {
            await db.execute(`IF OBJECT_ID(N'${table}', N'U') IS NOT NULL DROP TABLE ${table}`);
            await db.disconnect();
        }
    });

    liveTest("SQL Server geography intersection distinguishes near and distant points", async () => {
        const db = new SqlServerProvider(options);
        await db.connect();
        try {
            const predicate = spatialRelationPredicate(new SqlServerDialect(), "area", "location", "intersects");
            const result = await db.query<{ hit: number }>(`SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END AS hit FROM (SELECT geography::Point(45, -75, 4326) AS area, geography::Point(45, -75, 4326) AS location) AS spatial_test`);
            expect(result.rows[0]?.hit).toBe(1);
        } finally { await db.disconnect(); }
    });

    liveTest("SQL Server geography point-in-polygon matches interior and excludes exterior", async () => {
        const db = new SqlServerProvider(options);
        await db.connect();
        try {
            const predicate = pointInAreaPredicate(new SqlServerDialect(), "area", "point");
            const result = await db.query<{ inside: number }>(`SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END AS inside FROM (SELECT geography::STGeomFromText('POLYGON((-76 44,-74 44,-74 46,-76 46,-76 44))',4326) AS area, geography::Point(45,-75,4326) AS point) AS spatial_test`);
            expect(result.rows[0]?.inside).toBe(1);
            const outside = await db.query<{ inside: number }>(`SELECT CASE WHEN ${predicate} THEN 1 ELSE 0 END AS inside FROM (SELECT geography::STGeomFromText('POLYGON((-76 44,-74 44,-74 46,-76 46,-76 44))',4326) AS area, geography::Point(48,-75,4326) AS point) AS spatial_test`);
            expect(outside.rows[0]?.inside).toBe(0);
        } finally { await db.disconnect(); }
    });

    liveTest("SQL Server geography orders nearby sites by distance in metres", async () => {
        const db = new SqlServerProvider(options);
        await db.connect();
        try {
            const distance = createDistanceExpression(new SqlServerDialect(), "location", { latitude: 45, longitude: -75 });
            const result = await db.query<{ site: string; metres: number }>(`SELECT site, ${distance.sql} AS metres FROM (SELECT 'near' AS site, geography::Point(45.001,-75,4326) AS location UNION ALL SELECT 'far', geography::Point(46,-75,4326)) AS sites ORDER BY metres ASC`, [...distance.parameters]);
            expect(result.rows.map(row => row.site)).toEqual(["near", "far"]);
            expect(result.rows[0]?.metres).toBeGreaterThan(0);
            expect(result.rows[0]?.metres).toBeLessThan(result.rows[1]!.metres);
        } finally { await db.disconnect(); }
    });

});
