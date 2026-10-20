/*
 * Rehearsal-only HTTP + real SQL integration. No permanent fixtures.
 * Runs a real Express HTTP server on an ephemeral loopback port.
 * The authorization, audit and tenant listing share one rollback transaction.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqlServerProvider } from "@intrusionshield/database";
import { createApp } from "../dist/app.js";
import { AccessTokenService } from "../dist/security/AccessTokenService.js";
import { createTenantAdminDependencies } from "../dist/application/createTenantAdminDependencies.js";

const expected = "Ruby_Isolation_Rehearsal_Platform";
if (process.env.RUBY_TENANT_SQL_TEST !== "I_ACKNOWLEDGE_ROLLBACK_ONLY" ||
    process.env.RUBY_SQL_DATABASE !== expected) {
    console.error("Refusing to run without rehearsal-only acknowledgement and exact database.");
    process.exitCode = 2;
} else if (["RUBY_SQL_SERVER", "RUBY_SQL_USER", "RUBY_SQL_PASSWORD"].some(k => !process.env[k])) {
    console.error("Missing SQL connection variables.");
    process.exitCode = 2;
} else {
    const options = {
        server: process.env.RUBY_SQL_SERVER,
        port: Number(process.env.RUBY_SQL_PORT || "1433"),
        database: expected,
        user: process.env.RUBY_SQL_USER,
        password: process.env.RUBY_SQL_PASSWORD,
        encrypt: process.env.RUBY_SQL_ENCRYPT === "true",
        trustServerCertificate: process.env.RUBY_SQL_TRUST_CERT === "true"
    };
    const db = new SqlServerProvider(options);
    const ids = {
        tenant: randomUUID(), admin: randomUUID(), ordinary: randomUUID(),
        role: randomUUID(), permission: randomUUID()
    };
    const params = values => Object.entries(values).map(([name, value]) => ({ name, value }));
    let transactionOpen = false;
    let server;
    try {
        await db.connect();
        const context = await db.query("SELECT DB_NAME() AS databaseName, USER_NAME() AS databaseUser");
        assert.equal(context.rows[0]?.databaseName, expected);
        assert.equal(context.rows[0]?.databaseUser, "ruby_platform_test_svc", "Restricted SQL account required");
        await db.beginTransaction();
        transactionOpen = true;
        for (const [id, name] of [[ids.admin, "Rehearsal Admin"], [ids.ordinary, "Rehearsal Ordinary"]]) {
            await db.execute(
                "INSERT INTO [Identity].[Identities] (TenantId, Id, IdentityType, Status, DisplayName) VALUES (@tenant, @id, N'USER', N'ACTIVE', @name)",
                params({ tenant: ids.tenant, id, name })
            );
        }
        await db.execute(
            "INSERT INTO [Identity].[Roles] (Id, TenantId, Name, Scope) VALUES (@id, NULL, @name, N'PLATFORM')",
            params({ id: ids.role, name: "RUBY_HTTP_TEST_" + ids.role })
        );
        await db.execute(
            "INSERT INTO [Identity].[Permissions] (Id, Name, Resource, Action, Scope) VALUES (@id, N'Rehearsal tenant read', N'platform.tenants', N'READ', N'PLATFORM')",
            params({ id: ids.permission })
        );
        await db.execute(
            "INSERT INTO [Identity].[RolePermissions] (RoleId, PermissionId, Scope) VALUES (@role, @permission, N'PLATFORM')",
            params({ role: ids.role, permission: ids.permission })
        );
        await db.execute(
            "INSERT INTO [Identity].[PlatformRoleAssignments] (TenantId, IdentityId, RoleId, Scope) VALUES (@tenant, @identity, @role, N'PLATFORM')",
            params({ tenant: ids.tenant, identity: ids.admin, role: ids.role })
        );
        const tokens = new AccessTokenService({
            secret: randomUUID() + randomUUID(), issuer: "ruby-rehearsal",
            audience: "ruby-rehearsal", lifetimeSeconds: 600
        });
        const issue = sub => tokens.issue({
            sub, tenantId: ids.tenant, identityType: "USER",
            displayName: "Rehearsal Test", language: "en",
            languageSource: "USER"
        }).token;
        const adminToken = issue(ids.admin);
        const ordinaryToken = issue(ids.ordinary);
        const dependencies = createTenantAdminDependencies(options, db, tokens);
        server = createApp(undefined, dependencies).listen(0, "127.0.0.1");
        await new Promise(resolve => server.once("listening", resolve));
        const base = "http://127.0.0.1:" + server.address().port + "/api/v1/admin/tenants";
        const request = (token, method = "GET") => fetch(base, {
            method,
            headers: {
                ...(token ? { Authorization: "Bearer " + token } : {}),
                ...(method === "POST" ? { "Content-Type": "application/json" } : {})
            },
            ...(method === "POST" ? { body: JSON.stringify({ code: "rehearsal", displayName: "Rehearsal Client", countryCode: "CA" }) } : {})
        });
        assert.equal((await request()).status, 401);
        assert.equal((await request("invalid")).status, 401);
        console.log("PASS: real HTTP requests without valid bearer tokens return 401");
        assert.equal((await request(ordinaryToken)).status, 403);
        console.log("PASS: ordinary authenticated user denied by SQL-backed authorization");
        const response = await request(adminToken);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.ok(Array.isArray(body.tenants));
        console.log("PASS: authorized administrator receives real SQL tenant list via HTTP");
        assert.equal((await request(adminToken, "POST")).status, 403);
        console.log("PASS: administrator with READ only cannot create tenants");
        const audit = await db.query(
            "SELECT Action AS action, Allowed AS allowed FROM [Identity].[AuthorizationAudit] WHERE TenantId=@tenant AND IdentityId IN (@admin, @ordinary) ORDER BY Id",
            params({ tenant: ids.tenant, admin: ids.admin, ordinary: ids.ordinary })
        );
        assert.deepEqual(audit.rows.map(row => [row.action, Boolean(row.allowed)]), [
            ["READ", false], ["READ", true], ["CREATE", false]
        ]);
        console.log("PASS: all authenticated authorization decisions recorded in SQL audit");
    } catch (error) {
        console.error("FAIL:", error);
        process.exitCode = 1;
    } finally {
        if (server) {
            try { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
            catch (error) { console.error("HTTP server shutdown failed:", error); process.exitCode = 1; }
        }
        if (transactionOpen) {
            try { await db.rollbackTransaction(); }
            catch (error) { console.error("ROLLBACK FAILED: inspect rehearsal database", error); process.exitCode = 1; }
        }
        try {
            const result = await db.query(
                "SELECT (SELECT COUNT(*) FROM [Identity].[Identities] WHERE TenantId=@tenant) AS identities, (SELECT COUNT(*) FROM [Identity].[Roles] WHERE Id=@role) AS roles, (SELECT COUNT(*) FROM [Identity].[Permissions] WHERE Id=@permission) AS permissions, (SELECT COUNT(*) FROM [Identity].[AuthorizationAudit] WHERE TenantId=@tenant) AS audits",
                params({ tenant: ids.tenant, role: ids.role, permission: ids.permission })
            );
            assert.deepEqual(result.rows[0], { identities: 0, roles: 0, permissions: 0, audits: 0 });
            console.log("PASS: SQL rollback removed temporary identities, roles, permissions and audit records");
        } catch (error) {
            console.error("Rollback verification failed:", error);
            process.exitCode = 1;
        }
        try { await db.disconnect(); }
        catch (error) { console.error("Disconnect failed:", error); process.exitCode = 1; }
    }
}
