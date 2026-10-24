
import test from "node:test";
import assert from "node:assert/strict";

import {
    TenantConnectionCleanupError
} from "../dist/application/TenantConnectionCleanupError.js";

test("cleanup error preserves all underlying failures", () => {
    const writeError = new Error(
        "Provisioning connection cleanup failed"
    );

    const auditError = new Error(
        "Audit connection cleanup failed"
    );

    const error = new TenantConnectionCleanupError([
        writeError,
        auditError
    ]);

    assert.ok(error instanceof AggregateError);

    assert.equal(
        error.name,
        "TenantConnectionCleanupError"
    );

    assert.deepEqual(error.errors, [
        writeError,
        auditError
    ]);

    assert.match(
        error.message,
        /database connection cleanup failed/
    );
});

test("cleanup error preserves a single failure", () => {
    const cleanupError = new Error(
        "Connection pool close failed"
    );

    const error = new TenantConnectionCleanupError([
        cleanupError
    ]);

    assert.equal(error.errors.length, 1);
    assert.equal(error.errors[0], cleanupError);
});
