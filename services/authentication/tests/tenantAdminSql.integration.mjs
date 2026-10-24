
/*
 * Explicit opt-in SQL Server integration test.
 *
 * Run ONLY against Ruby_Isolation_Rehearsal_Platform.
 * Uses the restricted ruby_platform_test_svc account.
 *
 * Test 1:
 *   Write tenant, configuration, audit, and outbox records
 *   in one transaction, then roll back.
 *
 * Test 2:
 *   Exercise TenantProvisioningService with an intentional
 *   failure AFTER the outbox insert, forcing service rollback.
 *
 * No test tenant or event may be committed.
 * Public tenant creation remains disabled.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { SqlServerProvider } from "@intrusionshield/database";
import { SqlTenantConfigurationRepository } from "@intrusionshield/tenant-configuration";
import { SqlEventOutboxRepository } from "@intrusionshield/event-persistence";

import { SqlPlatformTenantRepository } from "../dist/application/SqlPlatformTenantRepository.js";
import { TenantAuthorizationAudit } from "../dist/application/TenantAuthorizationAudit.js";
import { TenantProvisioningService } from "../dist/application/TenantProvisioningService.js";

const expectedDatabase = "Ruby_Isolation_Rehearsal_Platform";
const expectedUser = "ruby_platform_test_svc";
const optIn = "I_ACKNOWLEDGE_ROLLBACK_ONLY";

async function countRecords(provider, tenantId) {
    const result = await provider.query(
        `SELECT
            (SELECT COUNT(*)
             FROM [Platform].[Tenants]
             WHERE Id = @id) AS tenants,

            (SELECT COUNT(*)
             FROM [EIS].[TenantConfigurations]
             WHERE tenant_id = @id) AS configs,

            (SELECT COUNT(*)
             FROM [Platform].[EventOutbox]
             WHERE TenantId = @id) AS events,

            (SELECT COUNT(*)
             FROM [Identity].[AuthorizationAudit]
             WHERE TenantId = @id
               AND Resource = N'platform.tenants') AS audits`,
        [{ name: "id", value: tenantId }]
    );

    return result.rows[0];
}

function assertNoRecords(counts) {
    assert.deepEqual(counts, {
        tenants: 0,
        configs: 0,
        events: 0,
        audits: 0
    });
}

async function main() {
    if (process.env.RUBY_TENANT_SQL_TEST !== optIn) {
        throw new Error(
            "Explicit opt-in required: RUBY_TENANT_SQL_TEST=" + optIn
        );
    }

    if (process.env.RUBY_SQL_DATABASE !== expectedDatabase) {
        throw new Error(
            "Refusing to run outside " + expectedDatabase
        );
    }

    if (process.env.RUBY_SQL_USER !== expectedUser) {
        throw new Error(
            "Integration tests must use " + expectedUser
        );
    }

    const required = [
        "RUBY_SQL_SERVER",
        "RUBY_SQL_USER",
        "RUBY_SQL_PASSWORD"
    ];

    const missing = required.filter(name => !process.env[name]);

    if (missing.length > 0) {
        throw new Error(
            "Missing environment variables: " + missing.join(", ")
        );
    }

    const provider = new SqlServerProvider({
        server: process.env.RUBY_SQL_SERVER,
        port: Number(process.env.RUBY_SQL_PORT || "1433"),
        database: expectedDatabase,
        user: process.env.RUBY_SQL_USER,
        password: process.env.RUBY_SQL_PASSWORD,
        encrypt: process.env.RUBY_SQL_ENCRYPT === "true",
        trustServerCertificate:
            process.env.RUBY_SQL_TRUST_CERT === "true"
    });

    let transactionOpen = false;
    let directTenantId;
    let failedProvisioningId;

    try {
        await provider.connect();

        const identity = await provider.query(
            `SELECT
                DB_NAME() AS databaseName,
                USER_NAME() AS databaseUser`
        );

        assert.equal(
            identity.rows[0]?.databaseName,
            expectedDatabase,
            "Connected to unexpected database"
        );

        assert.equal(
            identity.rows[0]?.databaseUser,
            expectedUser,
            "Connected using unexpected database user"
        );

        const objects = await provider.query(
            `SELECT
                OBJECT_ID(N'Platform.Tenants', N'U') AS registry,
                OBJECT_ID(N'EIS.TenantConfigurations', N'U') AS config,
                OBJECT_ID(N'Identity.AuthorizationAudit', N'U') AS audit,
                OBJECT_ID(N'Platform.EventOutbox', N'U') AS outbox`
        );

        for (const [name, value] of Object.entries(objects.rows[0])) {
            assert.notEqual(
                value,
                null,
                name + " table is missing"
            );
        }

        const tenants = new SqlPlatformTenantRepository(provider);
        const configuration =
            new SqlTenantConfigurationRepository(provider);
        const audit = new TenantAuthorizationAudit(provider);
        const outbox = new SqlEventOutboxRepository(provider);

        // TEST 1: Four writes, followed by explicit rollback.
        await provider.beginTransaction();
        transactionOpen = true;

        const tenant = await tenants.create({
            code: "SMOKE_" + randomUUID().replaceAll("-", ""),
            displayName: "Ruby SQL Outbox Smoke Test",
            countryCode: "CA"
        });

        directTenantId = tenant.id;

        const now = new Date();

        await configuration.create({
            tenantId: tenant.id,
            countryCode: "CA",
            createdAt: now,
            updatedAt: now,
            version: 1
        });

        await audit.record(
            tenant.id,
            tenant.id,
            "CREATE",
            false
        );

        await outbox.append({
            id: randomUUID(),
            type: "tenant.created",
            version: "1.0",
            timestamp: now,
            tenantId: tenant.id,
            source: "ruby.authentication",
            payload: {
                tenantId: tenant.id,
                code: tenant.code,
                displayName: tenant.displayName,
                countryCode: tenant.countryCode
            }
        });

        const inside = await countRecords(
            provider,
            directTenantId
        );

        assert.deepEqual(inside, {
            tenants: 1,
            configs: 1,
            events: 1,
            audits: 1
        });

        console.log(
            "PASS: tenant, configuration, audit and event exist inside transaction"
        );

        await provider.rollbackTransaction();
        transactionOpen = false;

        assertNoRecords(
            await countRecords(provider, directTenantId)
        );

        console.log(
            "PASS: all four records disappeared after rollback"
        );

        // TEST 2: Real provisioning service rollback.
        // The event is actually inserted before failure is injected.
        const failingOutbox = {
            append: async event => {
                await outbox.append(event);

                throw new Error(
                    "INTENTIONAL_TEST_FAILURE_AFTER_OUTBOX_INSERT"
                );
            }
        };

        const provisioning = new TenantProvisioningService(
            provider,
            tenants,
            {
                create: async input => {
                    failedProvisioningId = input.tenantId;
                    await configuration.create(input);
                }
            },
            failingOutbox
        );

        await assert.rejects(
            provisioning.create({
                code: "ROLLBACK_" + randomUUID().replaceAll("-", ""),
                displayName: "Ruby Provisioning Rollback Test",
                countryCode: "CA"
            }),
            /INTENTIONAL_TEST_FAILURE_AFTER_OUTBOX_INSERT/
        );

        assert.ok(
            failedProvisioningId,
            "Expected provisioning to reach configuration creation"
        );

        assertNoRecords(
            await countRecords(provider, failedProvisioningId)
        );

        console.log(
            "PASS: provisioning service rolled back tenant, configuration and event"
        );

        console.log(
            "PASS: all SQL integration tests completed without committed test records"
        );
    } finally {
        if (transactionOpen) {
            try {
                await provider.rollbackTransaction();
                transactionOpen = false;
            } catch (error) {
                console.error(
                    "CRITICAL: rollback failed; manual verification required:",
                    error
                );
                throw error;
            }
        }

        try {
            if (directTenantId) {
                assertNoRecords(
                    await countRecords(provider, directTenantId)
                );
            }

            if (failedProvisioningId) {
                assertNoRecords(
                    await countRecords(provider, failedProvisioningId)
                );
            }
        } finally {
            await provider.disconnect();
        }
    }
}

main().catch(error => {
    console.error("FAIL: SQL integration test", error);
    process.exitCode = 1;
});
