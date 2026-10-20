/*
 * Explicit opt-in SQL Server integration test.
 * Run ONLY against Ruby_Isolation_Rehearsal_Platform.
 * All writes use one provider transaction and are rolled back.
 * This intentionally does not call TenantProvisioningService.create(),
 * which commits its own transaction; committed provisioning requires a
 * separately approved disposable database test plan.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SqlServerProvider } from "@intrusionshield/database";
import { SqlTenantConfigurationRepository } from "@intrusionshield/tenant-configuration";
import { SqlPlatformTenantRepository } from "../dist/application/SqlPlatformTenantRepository.js";
import { TenantAuthorizationAudit } from "../dist/application/TenantAuthorizationAudit.js";

const expected = "Ruby_Isolation_Rehearsal_Platform";
if (process.env.RUBY_TENANT_SQL_TEST !== "I_ACKNOWLEDGE_ROLLBACK_ONLY") {
    console.error("Not running: set RUBY_TENANT_SQL_TEST=I_ACKNOWLEDGE_ROLLBACK_ONLY to opt in.");
    process.exitCode = 2;
} else if (process.env.RUBY_SQL_DATABASE !== expected) {
    console.error("Refusing to run: RUBY_SQL_DATABASE must be " + expected);
    process.exitCode = 2;
} else {
    const required = ["RUBY_SQL_SERVER", "RUBY_SQL_USER", "RUBY_SQL_PASSWORD"];
    const missing = required.filter(name => !process.env[name]);
    if (missing.length) {
        console.error("Missing environment variables: " + missing.join(", "));
        process.exitCode = 2;
    } else {
        const provider = new SqlServerProvider({
            server: process.env.RUBY_SQL_SERVER,
            port: Number(process.env.RUBY_SQL_PORT || "1433"),
            database: expected,
            user: process.env.RUBY_SQL_USER,
            password: process.env.RUBY_SQL_PASSWORD,
            encrypt: process.env.RUBY_SQL_ENCRYPT === "true",
            trustServerCertificate: process.env.RUBY_SQL_TRUST_CERT === "true"
        });
        let transactionOpen = false;
        let testId;
        try {
            await provider.connect();
            const actual = await provider.query("SELECT DB_NAME() AS databaseName");
            assert.equal(actual.rows[0]?.databaseName, expected, "Connected to unexpected database");
            const objects = await provider.query(
                "SELECT OBJECT_ID(N'Platform.Tenants', N'U') AS registry, OBJECT_ID(N'EIS.TenantConfigurations', N'U') AS config, OBJECT_ID(N'Identity.AuthorizationAudit', N'U') AS audit"
            );
            for (const [name, value] of Object.entries(objects.rows[0])) {
                assert.notEqual(value, null, name + " table missing");
            }
            const repo = new SqlPlatformTenantRepository(provider);
            const config = new SqlTenantConfigurationRepository(provider);
            const audit = new TenantAuthorizationAudit(provider);
            const code = "SMOKE_" + randomUUID().replaceAll("-", "");
            await provider.beginTransaction();
            transactionOpen = true;
            const created = await repo.create({ code, displayName: "Ruby TypeScript SQL Smoke", countryCode: "CA" });
            testId = created.id;
            const now = new Date();
            await config.create({ tenantId: testId, countryCode: "CA", createdAt: now, updatedAt: now, version: 1 });
            await audit.record(testId, testId, "CREATE", false);
            const listed = await repo.list(100, 0);
            // Pagination may exclude the new record if more than 100 tenants exist.
            const direct = await provider.query(
                "SELECT Id AS id FROM [Platform].[Tenants] WHERE Id = @id",
                [{ name: "id", value: testId }]
            );
            assert.equal(direct.rows[0]?.id, testId);
            const settings = await config.findByTenantId(testId);
            assert.equal(settings?.countryCode, "CA");
            const auditRows = await provider.query(
                "SELECT COUNT(*) AS count FROM [Identity].[AuthorizationAudit] WHERE TenantId = @id AND Resource = N'platform.tenants'",
                [{ name: "id", value: testId }]
            );
            assert.equal(auditRows.rows[0]?.count, 1);
            // SQL Server must enforce normalized uniqueness regardless of casing.
            await assert.rejects(repo.create({ code: code.toLowerCase(), displayName: "Duplicate", countryCode: "CA" }));
            console.log("PASS: TypeScript repository insert/read, configuration, audit and duplicate rejection");
        } catch (error) {
            console.error("FAIL:", error);
            process.exitCode = 1;
        } finally {
            if (transactionOpen) {
                try {
                    await provider.rollbackTransaction();
                } catch (error) {
                    console.error("Rollback failed; manual verification required:", error);
                    process.exitCode = 1;
                }
            }
            try {
                if (testId) {
                    const checks = await provider.query(
                        "SELECT (SELECT COUNT(*) FROM [Platform].[Tenants] WHERE Id = @id) AS tenants, (SELECT COUNT(*) FROM [EIS].[TenantConfigurations] WHERE tenant_id = @id) AS configs, (SELECT COUNT(*) FROM [Identity].[AuthorizationAudit] WHERE TenantId = @id AND Resource = N'platform.tenants') AS audits",
                        [{ name: "id", value: testId }]
                    );
                    assert.deepEqual(checks.rows[0], { tenants: 0, configs: 0, audits: 0 });
                    console.log("PASS: rollback verified; no smoke records persisted");
                }
            } catch (error) {
                console.error("Cleanup verification failed:", error);
                process.exitCode = 1;
            }
            await provider.disconnect();
        }
    }
}
