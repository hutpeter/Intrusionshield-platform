/*
 * Explicit opt-in, rollback-only duplicate tenant code integration test.
 * Requires the same environment settings as tenantAdminSql.integration.mjs.
 * No production or shared database is allowed.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqlServerProvider } from "@intrusionshield/database";
import { SqlPlatformTenantRepository, TenantConflictError } from "../dist/application/SqlPlatformTenantRepository.js";

const expected = "Ruby_Isolation_Rehearsal_Platform";
if (process.env.RUBY_TENANT_SQL_TEST !== "I_ACKNOWLEDGE_ROLLBACK_ONLY" ||
    process.env.RUBY_SQL_DATABASE !== expected) {
    console.error("Refusing to run: opt-in and exact rehearsal database name required.");
    process.exitCode = 2;
} else if (["RUBY_SQL_SERVER", "RUBY_SQL_USER", "RUBY_SQL_PASSWORD"].some(k => !process.env[k])) {
    console.error("Missing required RUBY_SQL_SERVER, RUBY_SQL_USER or RUBY_SQL_PASSWORD.");
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
    let started = false;
    let id;
    try {
        await db.connect();
        const identity = await db.query("SELECT DB_NAME() AS name, USER_NAME() AS userName");
        assert.equal(identity.rows[0]?.name, expected);
        assert.equal(identity.rows[0]?.userName, "ruby_platform_test_svc", "Restricted SQL user required");
        const repo = new SqlPlatformTenantRepository(db);
        const code = "DUP_" + randomUUID().replaceAll("-", "");
        await db.beginTransaction();
        started = true;
        const first = await repo.create({ code, displayName: "Duplicate Code Test", countryCode: "CA" });
        id = first.id;
        await assert.rejects(
            repo.create({ code: code.toLowerCase(), displayName: "Duplicate Code Test Two", countryCode: "CA" }),
            error => error instanceof TenantConflictError,
            "Duplicate code should map to TenantConflictError"
        );
        console.log("PASS: duplicate tenant code rejected case-insensitively and mapped to TenantConflictError");
    } catch (error) {
        console.error("FAIL:", error);
        process.exitCode = 1;
    } finally {
        if (started) {
            try {
                await db.rollbackTransaction();
            } catch (error) {
                console.error("ROLLBACK FAILED; inspect rehearsal database:", error);
                process.exitCode = 1;
            }
        }
        if (id) {
            try {
                const result = await db.query(
                    "SELECT COUNT(*) AS count FROM [Platform].[Tenants] WHERE Id = @id",
                    [{ name: "id", value: id }]
                );
                assert.equal(result.rows[0]?.count, 0);
                console.log("PASS: duplicate-code test transaction rolled back; no test tenant persisted");
            } catch (error) {
                console.error("Rollback verification failed:", error);
                process.exitCode = 1;
            }
        }
        await db.disconnect();
    }
}
