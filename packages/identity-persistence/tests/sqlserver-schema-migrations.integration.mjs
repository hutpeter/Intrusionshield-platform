import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SqlServerProvider, SqlServerMigrationHistoryStore, runVersionedMigrations } from "../../database/dist/index.js";

// The CI SQL Server service is disposable. Use a dedicated database to avoid
// modifying master or sharing history with the generic migration integration suite.
const options = {
    server: process.env.RUBY_TEST_SQLSERVER_HOST ?? "localhost",
    port: Number(process.env.RUBY_TEST_SQLSERVER_PORT ?? 1433),
    user: process.env.RUBY_TEST_SQLSERVER_USER ?? "sa",
    password: process.env.RUBY_TEST_SQLSERVER_PASSWORD ?? "",
    encrypt: false,
    trustServerCertificate: true
};
const database = "ruby_identity_migration_ci";
const admin = new SqlServerProvider({ ...options, database: "master" });
await admin.connect();
try {
    await admin.execute(`IF DB_ID(N'${database}') IS NULL CREATE DATABASE [${database}]`);
} finally {
    await admin.disconnect();
}
const files = [
    ["identity_001", "001_identity_foundation.sql"],
    ["identity_002", "002_authorization_foundation.sql"],
    ["identity_003", "003_identity_tenant_security.sql"]
];
const directory = new URL("../sql/", import.meta.url);
const migrations = await Promise.all(files.map(async ([id, file]) => ({
    id,
    description: file,
    sqlserver: await readFile(new URL(file, directory), "utf8"),
    postgresql: "-- SQL Server integration fixture only"
})));
const provider = new SqlServerProvider({ ...options, database });
await provider.connect();
try {
    const store = new SqlServerMigrationHistoryStore(provider);
    assert.deepEqual(await runVersionedMigrations("sqlserver", migrations, store), files.map(([id]) => id));
    assert.deepEqual(await runVersionedMigrations("sqlserver", migrations, store), []);
    const tables = await provider.query(
        "SELECT COUNT(*) AS count FROM sys.tables WHERE schema_id = SCHEMA_ID(N'Identity')"
    );
    assert.ok(tables.rows[0].count >= 9, "Identity and authorization tables must exist");
    const history = await provider.query(
        "SELECT migration_id AS id FROM dbo.ruby_schema_migrations ORDER BY sequence_number"
    );
    assert.deepEqual(history.rows.map(row => row.id), files.map(([id]) => id));
    const policies = await provider.query(
        "SELECT COUNT(*) AS count FROM sys.security_predicates WHERE object_id = OBJECT_ID(N'Identity.IdentityTenantPolicy')"
    );
    assert.equal(policies.rows[0].count, 15, "Five identity tables must each have filter and write-block predicates");
    const tenantA = "11111111-1111-4111-8111-111111111111";
    const tenantB = "22222222-2222-4222-8222-222222222222";
    const identityA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const identityB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[Identities] (TenantId,Id,IdentityType,Status,DisplayName) VALUES (@tenant,@id,N'USER',N'ACTIVE',N'Alpha')",
        [{ name: "tenant", value: tenantA }, { name: "id", value: identityA }]
    ));
    await provider.withTenantTransaction(tenantB, tx => tx.execute(
        "INSERT INTO [Identity].[Identities] (TenantId,Id,IdentityType,Status,DisplayName) VALUES (@tenant,@id,N'USER',N'ACTIVE',N'Beta')",
        [{ name: "tenant", value: tenantB }, { name: "id", value: identityB }]
    ));
    for (const [tenant, expected] of [[tenantA, "Alpha"], [tenantB, "Beta"]]) {
        const rows = await provider.withTenantTransaction(tenant, tx =>
            tx.query("SELECT DisplayName FROM [Identity].[Identities]")
        );
        assert.deepEqual(rows.rows.map(row => row.DisplayName), [expected]);
    }
    assert.equal((await provider.query("SELECT Id FROM [Identity].[Identities]")).rows.length, 0);
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[Identities] (TenantId,Id,IdentityType,Status,DisplayName) VALUES (@tenant,@id,N'USER',N'ACTIVE',N'Forbidden')",
        [{ name: "tenant", value: tenantB }, { name: "id", value: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }]
    )));
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "UPDATE [Identity].[Identities] SET TenantId=@other WHERE TenantId=@tenant AND Id=@id",
        [{ name: "other", value: tenantB }, { name: "tenant", value: tenantA }, { name: "id", value: identityA }]
    )));
    const untouched = await provider.withTenantTransaction(tenantA, tx =>
        tx.query("SELECT TenantId FROM [Identity].[Identities] WHERE Id=@id", [{ name: "id", value: identityA }])
    );
    assert.equal(untouched.rows.length, 1, "Rejected tenant reassignment must roll back");
    console.log("Versioned SQL Server identity schema and tenant RLS checks passed");
} finally {
    await provider.disconnect();
}
