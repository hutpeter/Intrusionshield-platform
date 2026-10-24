
import test from "node:test";
import assert from "node:assert/strict";

import {
    TenantProvisioningReconciliation
} from "../dist/application/TenantProvisioningReconciliation.js";

const sampleAudit = {
    Id: "11111111-1111-4111-8111-111111111111",
    CorrelationId: "22222222-2222-4222-8222-222222222222",
    ActorIdentityId: "33333333-3333-4333-8333-333333333333",
    ActorTenantId: "44444444-4444-4444-8444-444444444444",
    RequestedTenantCode: "DEMO",
    TargetTenantId: null,
    Status: "STARTED",
    StartedAt: new Date("2026-10-01T10:00:00Z"),
    AgeMinutes: 30
};

function createFixture(rows = []) {
    const calls = [];

    const database = {
        query: async (sql, parameters) => {
            calls.push({
                method: "query",
                sql,
                parameters
            });

            return {
                rows,
                rowCount: rows.length
            };
        },

        execute: async () => {
            throw new Error("Unexpected database write");
        },

        beginTransaction: async () => {
            throw new Error("Unexpected transaction");
        },

        commitTransaction: async () => {
            throw new Error("Unexpected commit");
        },

        rollbackTransaction: async () => {
            throw new Error("Unexpected rollback");
        }
    };

    return {
        reconciliation: new TenantProvisioningReconciliation(database),
        calls
    };
}

function parameter(call, name) {
    return call.parameters.find(
        item => item.name === name
    )?.value;
}

test("returns unresolved provisioning audit records", async () => {
    const { reconciliation, calls } = createFixture([sampleAudit]);

    const records = await reconciliation.listStale();

    assert.deepEqual(records, [sampleAudit]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "query");
});

test("uses parameterized stale threshold and correct SQL filters", async () => {
    const { reconciliation, calls } = createFixture();

    await reconciliation.listStale(30);

    assert.equal(calls.length, 1);

    const call = calls[0];

    assert.match(
        call.sql,
        /FROM \[Platform\]\.\[TenantProvisioningAudit\]/
    );

    assert.match(call.sql, /Status = N'STARTED'/);
    assert.match(call.sql, /Operation = N'CREATE'/);
    assert.match(call.sql, /StartedAt <= DATEADD/);

    assert.match(call.sql, /@staleMinutes/);
    assert.equal(parameter(call, "staleMinutes"), 30);
});

test("uses a default stale threshold of 15 minutes", async () => {
    const { reconciliation, calls } = createFixture();

    await reconciliation.listStale();

    assert.equal(parameter(calls[0], "staleMinutes"), 15);
});

test("rejects invalid thresholds before querying", async () => {
    const { reconciliation, calls } = createFixture();

    const invalidValues = [
        0,
        -1,
        1.5,
        NaN,
        Infinity,
        10081,
        "15",
        null
    ];

    for (const value of invalidValues) {
        await assert.rejects(
            () => reconciliation.listStale(value),
            /Stale threshold must be an integer/
        );
    }

    assert.equal(calls.length, 0);
});

test("propagates database query failures", async () => {
    const database = {
        query: async () => {
            throw new Error("Reconciliation database unavailable");
        }
    };

    const reconciliation =
        new TenantProvisioningReconciliation(database);

    await assert.rejects(
        () => reconciliation.listStale(),
        /Reconciliation database unavailable/
    );
});

test("does not perform database writes or transactions", async () => {
    const { reconciliation, calls } = createFixture([sampleAudit]);

    await reconciliation.listStale(15);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "query");

    assert.match(
        calls[0].sql.trim(),
        /^SELECT\b/i
    );
});
