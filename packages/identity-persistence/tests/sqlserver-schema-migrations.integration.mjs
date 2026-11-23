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
    ["identity_003", "003_identity_tenant_security.sql"],
    ["identity_004", "004_authorization_tenant_security.sql"],
    ["identity_005", "005_authorization_audit_tenant_security.sql"],
    ["identity_006", "006_platform_assignment_privileged_writes.sql"],
    ["identity_007", "007_platform_assignment_delete_protection.sql"]
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
    assert.equal(policies.rows[0].count, 22, "Seven protected tables plus platform-assignment delete guard must be deployed");
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
    await provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[Users] (TenantId,IdentityId,Username,NormalizedUsername,Email,NormalizedEmail) VALUES (@tenant,@id,N'alpha',N'ALPHA',N'alpha@example.test',N'ALPHA@EXAMPLE.TEST')",
        [{ name: "tenant", value: tenantA }, { name: "id", value: identityA }]
    ));
    assert.equal((await provider.query("SELECT Username FROM [Identity].[Users]")).rows.length, 0);
    assert.equal((await provider.withTenantTransaction(tenantB, tx =>
        tx.query("SELECT Username FROM [Identity].[Users]")
    )).rows.length, 0);
    await assert.rejects(provider.withTenantTransaction(tenantB, tx => tx.execute(
        "INSERT INTO [Identity].[Users] (TenantId,IdentityId,Username,NormalizedUsername,Email,NormalizedEmail) VALUES (@tenant,@id,N'forbidden',N'FORBIDDEN',N'forbidden@example.test',N'FORBIDDEN@EXAMPLE.TEST')",
        [{ name: "tenant", value: tenantA }, { name: "id", value: identityA }]
    )));
    assert.equal((await provider.withTenantTransaction(tenantA, tx =>
        tx.query("SELECT Username FROM [Identity].[Users]")
    )).rows.length, 1);
    await assert.rejects(provider.execute(
        "INSERT INTO [Identity].[Identities] (TenantId,Id,IdentityType,Status,DisplayName) VALUES (@tenant,@id,N'USER',N'ACTIVE',N'Unscoped')",
        [{ name: "tenant", value: tenantA }, { name: "id", value: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }]
    ));
    const roleA = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const roleB = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[Roles] (Id,TenantId,Name,Scope) VALUES (@id,@tenant,N'AlphaRole',N'TENANT')",
        [{ name: "id", value: roleA }, { name: "tenant", value: tenantA }]
    ));
    await provider.withTenantTransaction(tenantB, tx => tx.execute(
        "INSERT INTO [Identity].[Roles] (Id,TenantId,Name,Scope) VALUES (@id,@tenant,N'BetaRole',N'TENANT')",
        [{ name: "id", value: roleB }, { name: "tenant", value: tenantB }]
    ));
    assert.deepEqual((await provider.withTenantTransaction(tenantA, tx =>
        tx.query("SELECT Name FROM [Identity].[Roles] ORDER BY Name")
    )).rows.map(row => row.Name), ["AlphaRole"]);
    assert.deepEqual((await provider.withTenantTransaction(tenantB, tx =>
        tx.query("SELECT Name FROM [Identity].[Roles] ORDER BY Name")
    )).rows.map(row => row.Name), ["BetaRole"]);
    assert.equal((await provider.query("SELECT Name FROM [Identity].[Roles]")).rows.length, 0);
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[Roles] (Id,TenantId,Name,Scope) VALUES (NEWID(),@tenant,N'ForbiddenRole',N'TENANT')",
        [{ name: "tenant", value: tenantB }]
    )));
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "UPDATE [Identity].[Roles] SET TenantId=@other WHERE Id=@id",
        [{ name: "other", value: tenantB }, { name: "id", value: roleA }]
    )));
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[Roles] (Id,TenantId,Name,Scope) VALUES (NEWID(),NULL,N'ForbiddenPlatformRole',N'PLATFORM')"
    )));
    await provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[AuthorizationAudit] (TenantId,IdentityId,Resource,Action,Allowed) VALUES (@tenant,@id,N'identity',N'read',1)",
        [{ name: "tenant", value: tenantA }, { name: "id", value: identityA }]
    ));
    await provider.withTenantTransaction(tenantB, tx => tx.execute(
        "INSERT INTO [Identity].[AuthorizationAudit] (TenantId,IdentityId,Resource,Action,Allowed) VALUES (@tenant,@id,N'identity',N'read',0)",
        [{ name: "tenant", value: tenantB }, { name: "id", value: identityB }]
    ));
    assert.equal((await provider.query("SELECT Id FROM [Identity].[AuthorizationAudit]")).rows.length, 0);
    for (const tenant of [tenantA, tenantB]) {
        const result = await provider.withTenantTransaction(tenant, tx =>
            tx.query("SELECT TenantId FROM [Identity].[AuthorizationAudit]")
        );
        assert.equal(result.rows.length, 1, "Audit records must be isolated by tenant");
        assert.equal(String(result.rows[0].TenantId).toLowerCase(), tenant);
    }
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[AuthorizationAudit] (TenantId,Resource,Action,Allowed) VALUES (@other,N'identity',N'write',0)",
        [{ name: "other", value: tenantB }]
    )));
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[AuthorizationAudit] (TenantId,Resource,Action,Allowed) VALUES (NULL,N'platform',N'admin',0)"
    )));
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "UPDATE [Identity].[AuthorizationAudit] SET TenantId=@other WHERE TenantId=@tenant",
        [{ name: "other", value: tenantB }, { name: "tenant", value: tenantA }]
    )));
    await provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[ServiceIdentities] (TenantId,IdentityId,ServiceName) VALUES (@tenant,@id,N'alpha-service')",
        [{ name: "tenant", value: tenantA }, { name: "id", value: identityA }]
    ));
    assert.equal((await provider.query("SELECT ServiceName FROM [Identity].[ServiceIdentities]")).rows.length, 0);
    assert.equal((await provider.withTenantTransaction(tenantB, tx =>
        tx.query("SELECT ServiceName FROM [Identity].[ServiceIdentities]")
    )).rows.length, 0);
    await assert.rejects(provider.withTenantTransaction(tenantB, tx => tx.execute(
        "INSERT INTO [Identity].[ServiceIdentities] (TenantId,IdentityId,ServiceName) VALUES (@tenant,@id,N'forbidden-service')",
        [{ name: "tenant", value: tenantA }, { name: "id", value: identityA }]
    )));
    await provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[IdentityRoles] (TenantId,IdentityId,RoleId) VALUES (@tenant,@identity,@role)",
        [{ name: "tenant", value: tenantA }, { name: "identity", value: identityA }, { name: "role", value: roleA }]
    ));
    assert.equal((await provider.query("SELECT RoleId FROM [Identity].[IdentityRoles]")).rows.length, 0);
    assert.equal((await provider.withTenantTransaction(tenantB, tx =>
        tx.query("SELECT RoleId FROM [Identity].[IdentityRoles]")
    )).rows.length, 0);
    await assert.rejects(provider.withTenantTransaction(tenantB, tx => tx.execute(
        "INSERT INTO [Identity].[IdentityRoles] (TenantId,IdentityId,RoleId) VALUES (@tenant,@identity,@role)",
        [{ name: "tenant", value: tenantA }, { name: "identity", value: identityA }, { name: "role", value: roleA }]
    )));
    await assert.rejects(provider.withTenantTransaction(tenantB, tx => tx.execute(
        "INSERT INTO [Identity].[IdentityRoles] (TenantId,IdentityId,RoleId) VALUES (@tenant,@identity,@role)",
        [{ name: "tenant", value: tenantB }, { name: "identity", value: identityB }, { name: "role", value: roleA }]
    )), "Composite tenant/role FK must reject cross-tenant role assignment");
    assert.equal((await provider.withTenantTransaction(tenantA, tx =>
        tx.query("SELECT RoleId FROM [Identity].[IdentityRoles]")
    )).rows.length, 1);
    // Platform roles are global and intentionally readable, but tenant sessions
    // cannot create them. Provisioning here is performed by the migration admin
    // with the RLS policy disabled only for the duration of this disposable fixture.
    const platformRole = "99999999-9999-4999-8999-999999999999";
    await provider.execute("ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy] WITH (STATE = OFF)");
    try {
        await provider.execute(
            "INSERT INTO [Identity].[Roles] (Id,TenantId,Name,Scope) VALUES (@id,NULL,N'PlatformOperator',N'PLATFORM')",
            [{ name: "id", value: platformRole }]
        );
    } finally {
        await provider.execute("ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy] WITH (STATE = ON)");
    }
    for (const tenant of [tenantA, tenantB]) {
        const global = await provider.withTenantTransaction(tenant, tx =>
            tx.query("SELECT Name FROM [Identity].[Roles] WHERE Id=@id", [{ name: "id", value: platformRole }])
        );
        assert.deepEqual(global.rows.map(row => row.Name), ["PlatformOperator"]);
    }
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[PlatformRoleAssignments] (TenantId,IdentityId,RoleId) VALUES (@other,@identity,@role)",
        [{ name: "other", value: tenantB }, { name: "identity", value: identityB }, { name: "role", value: platformRole }]
    )));
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "INSERT INTO [Identity].[PlatformRoleAssignments] (TenantId,IdentityId,RoleId) VALUES (@tenant,@identity,@role)",
        [{ name: "tenant", value: tenantA }, { name: "identity", value: identityA }, { name: "role", value: platformRole }]
    )), "Tenant principals must not grant platform privileges even within their own tenant");
    assert.equal((await provider.query("SELECT RoleId FROM [Identity].[PlatformRoleAssignments]")).rows.length, 0);
    // A privileged provisioning fixture proves that tenant principals cannot
    // revoke an existing platform assignment. Policy changes are never exposed
    // through the tenant-scoped application API.
    await provider.execute("ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy] WITH (STATE = OFF)");
    try {
        await provider.execute(
            "INSERT INTO [Identity].[PlatformRoleAssignments] (TenantId,IdentityId,RoleId) VALUES (@tenant,@identity,@role)",
            [{ name: "tenant", value: tenantA }, { name: "identity", value: identityA }, { name: "role", value: platformRole }]
        );
    } finally {
        await provider.execute("ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy] WITH (STATE = ON)");
    }
    assert.equal((await provider.withTenantTransaction(tenantA, tx =>
        tx.query("SELECT RoleId FROM [Identity].[PlatformRoleAssignments]")
    )).rows.length, 1);
    await assert.rejects(provider.withTenantTransaction(tenantA, tx => tx.execute(
        "DELETE FROM [Identity].[PlatformRoleAssignments] WHERE TenantId=@tenant AND IdentityId=@identity",
        [{ name: "tenant", value: tenantA }, { name: "identity", value: identityA }]
    )), "Tenant principal must not revoke an existing platform assignment");
    assert.equal((await provider.withTenantTransaction(tenantA, tx =>
        tx.query("SELECT RoleId FROM [Identity].[PlatformRoleAssignments]")
    )).rows.length, 1);
    console.log("Versioned SQL Server identity schema and tenant RLS checks passed");
} finally {
    await provider.disconnect();
}
