/*
 * Read-only, opt-in authorization integration test.
 * Requires RUBY_TENANT_SQL_TEST=I_ACKNOWLEDGE_ROLLBACK_ONLY and
 * RUBY_SQL_DATABASE=Ruby_Isolation_Rehearsal_Platform.
 * Does not seed roles, grant permissions, or create identities.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqlServerProvider } from "@intrusionshield/database";
import { PlatformTenantAuthorization } from "../dist/application/PlatformTenantAuthorization.js";

const expected = "Ruby_Isolation_Rehearsal_Platform";
if (process.env.RUBY_TENANT_SQL_TEST !== "I_ACKNOWLEDGE_ROLLBACK_ONLY" ||
    process.env.RUBY_SQL_DATABASE !== expected) {
    console.error("Refusing to run: opt-in and exact rehearsal database required.");
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
    try {
        await db.connect();
        const context = await db.query("SELECT DB_NAME() AS databaseName, USER_NAME() AS databaseUser");
        assert.equal(context.rows[0]?.databaseName, expected);
        assert.equal(context.rows[0]?.databaseUser, "ruby_platform_test_svc", "Restricted SQL user required");
        const auth = new PlatformTenantAuthorization(db);
        const identityId = randomUUID();
        const tenantId = randomUUID();
        assert.equal(await auth.allowed(identityId, tenantId, "READ"), false);
        assert.equal(await auth.allowed(identityId, tenantId, "CREATE"), false);
        console.log("PASS: unknown identity denied READ and CREATE by real SQL-backed authorization");
        assert.equal(await auth.allowed("invalid-identity", tenantId, "READ"), false);
        assert.equal(await auth.allowed(identityId, "invalid-tenant", "CREATE"), false);
        console.log("PASS: malformed identity and tenant identifiers denied");
        console.log("NOTE: positive superuser grant and authorization-audit persistence require separate controlled fixtures.");
    } catch (error) {
        console.error("FAIL:", error);
        process.exitCode = 1;
    } finally {
        try { await db.disconnect(); } catch (error) {
            console.error("Disconnect failed:", error);
            process.exitCode = 1;
        }
    }
}
