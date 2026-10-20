/*
 * Opt-in SQL Server positive authorization test.
 * Writes only inside a transaction rolled back in finally.
 * Never use against production. No permanent roles or grants.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqlServerProvider } from "@intrusionshield/database";
import { PlatformTenantAuthorization } from "../dist/application/PlatformTenantAuthorization.js";

const expected = "Ruby_Isolation_Rehearsal_Platform";
if (process.env.RUBY_TENANT_SQL_TEST !== "I_ACKNOWLEDGE_ROLLBACK_ONLY" ||
    process.env.RUBY_SQL_DATABASE !== expected) {
    console.error("Refusing to run: explicit opt-in and exact rehearsal database required.");
    process.exitCode = 2;
} else if (["RUBY_SQL_SERVER", "RUBY_SQL_USER", "RUBY_SQL_PASSWORD"].some(k => !process.env[k])) {
    console.error("Missing SQL connection environment variables.");
    process.exitCode = 2;
} else {
    const db = new SqlServerProvider({
        server: process.env.RUBY_SQL_SERVER,
        port: Number(process.env.RUBY_SQL_PORT || "1433"),
        database: expected,
        user: process.env.RUBY_SQL_USER,
        password: process.env.RUBY_SQL_PASSWORD,
        encrypt: process.env.RUBY_SQL_ENCRYPT === "true",
        trustServerCertificate: process.env.RUBY_SQL_TRUST_CERT === "true"
    });
    const ids = {
        tenant: randomUUID(), admin: randomUUID(), ordinary: randomUUID(),
        role: randomUUID(), read: randomUUID(), create: randomUUID()
    };
    let transactionOpen = false;
    try {
        await db.connect();
        const context = await db.query("SELECT DB_NAME() AS dbName, USER_NAME() AS userName");
        assert.equal(context.rows[0]?.dbName, expected);
        assert.equal(context.rows[0]?.userName, "ruby_platform_test_svc", "Restricted SQL user required");
        await db.beginTransaction();
        transactionOpen = true;
        const params = (values) => Object.entries(values).map(([name, value]) => ({ name, value }));
        for (const [identity, displayName] of [[ids.admin, "Ruby Test Platform Admin"], [ids.ordinary, "Ruby Test Ordinary User"]]) {
            await db.execute(
                "INSERT INTO [Identity].[Identities] (TenantId, Id, IdentityType, Status, DisplayName) VALUES (@tenant, @id, N'USER', N'ACTIVE', @name)",
                params({ tenant: ids.tenant, id: identity, name: displayName })
            );
        }
        await db.execute(
            "INSERT INTO [Identity].[Roles] (Id, TenantId, Name, Scope) VALUES (@id, NULL, @name, N'PLATFORM')",
            params({ id: ids.role, name: "RUBY_AUTH_TEST_" + ids.role })
        );
        for (const [id, action] of [[ids.read, "READ"], [ids.create, "CREATE"]]) {
            await db.execute(
                "INSERT INTO [Identity].[Permissions] (Id, Name, Resource, Action, Scope) VALUES (@id, @name, N'platform.tenants', @action, N'PLATFORM')",
                params({ id, name: "Ruby test " + action, action })
            );
            await db.execute(
                "INSERT INTO [Identity].[RolePermissions] (RoleId, PermissionId, Scope) VALUES (@role, @permission, N'PLATFORM')",
                params({ role: ids.role, permission: id })
            );
        }
        await db.execute(
            "INSERT INTO [Identity].[PlatformRoleAssignments] (TenantId, IdentityId, RoleId, Scope) VALUES (@tenant, @identity, @role, N'PLATFORM')",
            params({ tenant: ids.tenant, identity: ids.admin, role: ids.role })
        );
        const auth = new PlatformTenantAuthorization(db);
        assert.equal(await auth.allowed(ids.admin, ids.tenant, "READ"), true);
        assert.equal(await auth.allowed(ids.admin, ids.tenant, "CREATE"), true);
        console.log("PASS: assigned active platform administrator granted READ and CREATE");
        assert.equal(await auth.allowed(ids.ordinary, ids.tenant, "READ"), false);
        assert.equal(await auth.allowed(ids.ordinary, ids.tenant, "CREATE"), false);
        assert.equal(await auth.allowed(ids.admin, randomUUID(), "READ"), false);
        console.log("PASS: ordinary identity and wrong tenant denied");
        await db.execute(
            "UPDATE [Identity].[Identities] SET Status=N'INACTIVE' WHERE TenantId=@tenant AND Id=@identity",
            params({ tenant: ids.tenant, identity: ids.admin })
        );
        assert.equal(await auth.allowed(ids.admin, ids.tenant, "READ"), false);
        assert.equal(await auth.allowed(ids.admin, ids.tenant, "CREATE"), false);
        console.log("PASS: inactive platform administrator denied");
        await db.execute(
            "UPDATE [Identity].[Identities] SET Status=N'ACTIVE' WHERE TenantId=@tenant AND Id=@identity",
            params({ tenant: ids.tenant, identity: ids.admin })
        );
        await db.execute(
            "DELETE FROM [Identity].[PlatformRoleAssignments] WHERE TenantId=@tenant AND IdentityId=@identity AND RoleId=@role",
            params({ tenant: ids.tenant, identity: ids.admin, role: ids.role })
        );
        assert.equal(await auth.allowed(ids.admin, ids.tenant, "READ"), false);
        assert.equal(await auth.allowed(ids.admin, ids.tenant, "CREATE"), false);
        console.log("PASS: revoked platform role assignment immediately denies access");
    } catch (error) {
        console.error("FAIL:", error);
        process.exitCode = 1;
    } finally {
        if (transactionOpen) {
            try { await db.rollbackTransaction(); }
            catch (error) {
                console.error("ROLLBACK FAILED — inspect rehearsal database:", error);
                process.exitCode = 1;
            }
        }
        try {
            const p = [{ name: "tenant", value: ids.tenant }, { name: "role", value: ids.role },
                       { name: "read", value: ids.read }, { name: "create", value: ids.create }];
            const result = await db.query(
                "SELECT (SELECT COUNT(*) FROM [Identity].[Identities] WHERE TenantId=@tenant) AS identities, (SELECT COUNT(*) FROM [Identity].[Roles] WHERE Id=@role) AS roles, (SELECT COUNT(*) FROM [Identity].[Permissions] WHERE Id IN (@read,@create)) AS permissions, (SELECT COUNT(*) FROM [Identity].[PlatformRoleAssignments] WHERE RoleId=@role) AS assignments, (SELECT COUNT(*) FROM [Identity].[RolePermissions] WHERE RoleId=@role) AS rolePermissions",
                p
            );
            assert.deepEqual(result.rows[0], { identities: 0, roles: 0, permissions: 0, assignments: 0, rolePermissions: 0 });
            console.log("PASS: transaction rolled back; no authorization fixtures persisted");
        } catch (error) {
            console.error("Rollback verification failed:", error);
            process.exitCode = 1;
        }
        try { await db.disconnect(); }
        catch (error) { console.error("Disconnect failed:", error); process.exitCode = 1; }
    }
}
