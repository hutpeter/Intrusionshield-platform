import test from "node:test";
import assert from "node:assert/strict";
import { TenantProvisioningAudit } from "../dist/application/TenantProvisioningAudit.js";

const context = {
    actorIdentityId: "11111111-1111-4111-8111-111111111111",
    actorTenantId: "22222222-2222-4222-8222-222222222222",
    correlationId: "33333333-3333-4333-8333-333333333333"
};

function createFixture() {
    const calls = [];

const database = {
    execute: async (sql, parameters) => {
        calls.push({ sql, parameters });
        return 1;
    }
};

    return {
        audit: new TenantProvisioningAudit(database),
        calls
    };
}

function parameter(call, name) {
    return call.parameters.find(item => item.name === name)?.value;
}

test("start records administrator context and requested tenant", async () => {
    const { audit, calls } = createFixture();

    const auditId = await audit.start(context, "DEMO");

    assert.match(
        auditId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /INSERT INTO \[Platform\]\.\[TenantProvisioningAudit\]/);
    assert.match(calls[0].sql, /N'STARTED'/);

    assert.equal(parameter(calls[0], "id"), auditId);
    assert.equal(parameter(calls[0], "correlationId"), context.correlationId);
    assert.equal(parameter(calls[0], "actorIdentityId"), context.actorIdentityId);
    assert.equal(parameter(calls[0], "actorTenantId"), context.actorTenantId);
    assert.equal(parameter(calls[0], "requestedTenantCode"), "DEMO");
});

test("succeed records the created tenant and completion time", async () => {
    const { audit, calls } = createFixture();

    await audit.succeed(
        "44444444-4444-4444-8444-444444444444",
        "55555555-5555-4555-8555-555555555555"
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /Status = N'SUCCEEDED'/);
    assert.match(calls[0].sql, /CompletedAt = SYSUTCDATETIME\(\)/);
    assert.match(calls[0].sql, /Status = N'STARTED'/);

    assert.equal(
        parameter(calls[0], "targetTenantId"),
        "55555555-5555-4555-8555-555555555555"
    );
});

test("fail records a failure code and completion time", async () => {
    const { audit, calls } = createFixture();

    await audit.fail(
        "44444444-4444-4444-8444-444444444444",
        "TENANT_PROVISIONING_FAILED"
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].sql, /Status = N'FAILED'/);
    assert.match(calls[0].sql, /CompletedAt = SYSUTCDATETIME\(\)/);
    assert.match(calls[0].sql, /Status = N'STARTED'/);

    assert.equal(
        parameter(calls[0], "failureCode"),
        "TENANT_PROVISIONING_FAILED"
    );
});

test("database write failures propagate", async () => {
    const database = {
        execute: async () => {
            throw new Error("Audit database unavailable");
        }
    };

    const audit = new TenantProvisioningAudit(database);

    await assert.rejects(
        () => audit.start(context, "DEMO"),
        /Audit database unavailable/
    );
});
test("start rejects an insert that affects no rows", async () => {
    const audit = new TenantProvisioningAudit({
        execute: async () => 0
    });

    await assert.rejects(
        () => audit.start(context, "DEMO"),
        /start insert affected 0 rows; expected exactly one/
    );
});

test("succeed rejects missing or already completed audit records", async () => {
    const audit = new TenantProvisioningAudit({
        execute: async () => 0
    });

    await assert.rejects(
        () => audit.succeed(
            "44444444-4444-4444-8444-444444444444",
            "55555555-5555-4555-8555-555555555555"
        ),
        /success update affected 0 rows; expected exactly one/
    );
});

test("fail rejects updates affecting multiple audit records", async () => {
    const audit = new TenantProvisioningAudit({
        execute: async () => 2
    });

    await assert.rejects(
        () => audit.fail(
            "44444444-4444-4444-8444-444444444444",
            "TENANT_PROVISIONING_FAILED"
        ),
        /failure update affected 2 rows; expected exactly one/
    );
});