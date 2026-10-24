
import test from "node:test";
import assert from "node:assert/strict";

import {
    cleanupTenantAdminConnections
} from "../dist/application/cleanupTenantAdminConnections.js";

import {
    TenantConnectionCleanupError
} from "../dist/application/TenantConnectionCleanupError.js";

function connection(disconnect) {
    return { disconnect };
}

test("successfully disconnects both connections", async () => {
    const calls = [];

    await cleanupTenantAdminConnections(
        connection(async () => calls.push("write")),
        connection(async () => calls.push("audit")),
        false
    );

    assert.deepEqual(calls, ["write", "audit"]);
});

test("attempts both disconnects when one fails", async () => {
    const calls = [];
    const cleanupError = new Error("Write cleanup failed");

    await assert.rejects(
        cleanupTenantAdminConnections(
            connection(async () => {
                calls.push("write");
                throw cleanupError;
            }),
            connection(async () => {
                calls.push("audit");
            }),
            false
        ),
        error => {
            assert.ok(
                error instanceof TenantConnectionCleanupError
            );

            assert.deepEqual(error.errors, [cleanupError]);
            return true;
        }
    );

    assert.deepEqual(calls, ["write", "audit"]);
});

test("preserves both cleanup failures", async () => {
    const writeError = new Error("Write cleanup failed");
    const auditError = new Error("Audit cleanup failed");

    await assert.rejects(
        cleanupTenantAdminConnections(
            connection(async () => {
                throw writeError;
            }),
            connection(async () => {
                throw auditError;
            }),
            false
        ),
        error => {
            assert.ok(
                error instanceof TenantConnectionCleanupError
            );

            assert.deepEqual(error.errors, [
                writeError,
                auditError
            ]);

            return true;
        }
    );
});

test("preserves original provisioning error", async () => {
    const provisioningError = new Error(
        "Tenant provisioning failed"
    );

    await assert.rejects(
        cleanupTenantAdminConnections(
            connection(async () => {}),
            connection(async () => {}),
            true,
            provisioningError
        ),
        error => error === provisioningError
    );
});

test("preserves provisioning error when cleanup also fails", async () => {
    const provisioningError = new Error(
        "Tenant provisioning failed"
    );

    const cleanupError = new Error(
        "Database cleanup failed"
    );

    await assert.rejects(
        cleanupTenantAdminConnections(
            connection(async () => {
                throw cleanupError;
            }),
            connection(async () => {}),
            true,
            provisioningError
        ),
        error => error === provisioningError
    );
});
