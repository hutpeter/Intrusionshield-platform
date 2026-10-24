
import test from "node:test";
import assert from "node:assert/strict";
import {
    TenantTransactionOutcomeError
} from "../dist/application/TenantTransactionOutcomeError.js";

import {
    AuditedTenantProvisioningService
} from "../dist/application/AuditedTenantProvisioningService.js";

const context = {
    actorIdentityId: "11111111-1111-4111-8111-111111111111",
    actorTenantId: "22222222-2222-4222-8222-222222222222",
    correlationId: "33333333-3333-4333-8333-333333333333"
};

const input = {
    code: "demo",
    displayName: "Demo Client",
    countryCode: "ca"
};

const tenant = {
    id: "44444444-4444-4444-8444-444444444444",
    code: "demo",
    displayName: "Demo Client",
    countryCode: "CA",
    status: "ACTIVE"
};

function createFixture(overrides = {}) {
    const calls = [];

    const provisioning = {
        create: async value => {
            calls.push(["provision", value]);
            return tenant;
        },
        ...overrides.provisioning
    };

    const audit = {
        start: async (ctx, code) => {
            calls.push(["start", ctx, code]);
            return "55555555-5555-4555-8555-555555555555";
        },
        succeed: async (id, tenantId) => {
            calls.push(["succeed", id, tenantId]);
        },
        fail: async (id, code) => {
            calls.push(["fail", id, code]);
        },
        ...overrides.audit
    };

    return {
        service: new AuditedTenantProvisioningService(
            provisioning,
            audit
        ),
        calls
    };
}

test("successful provisioning starts and completes audit in order", async () => {
    const { service, calls } = createFixture();

    const result = await service.create(input, context);

    assert.equal(result, tenant);

    assert.deepEqual(
        calls.map(call => call[0]),
        ["start", "provision", "succeed"]
    );

    assert.equal(calls[0][2], "demo");
    assert.equal(calls[0][1].actorIdentityId, context.actorIdentityId);
    assert.equal(calls[1][1].countryCode, "CA");
    assert.equal(calls[2][2], tenant.id);
});

test("audit start failure prevents tenant provisioning", async () => {
    const { service, calls } = createFixture({
        audit: {
            start: async () => {
                calls.push(["start"]);
                throw new Error("Audit unavailable");
            }
        }
    });

    await assert.rejects(
        () => service.create(input, context),
        /Audit unavailable/
    );

    assert.deepEqual(
        calls.map(call => call[0]),
        ["start"]
    );
});

test("provisioning failure records failed audit", async () => {
    const { service, calls } = createFixture({
        provisioning: {
            create: async () => {
                calls.push(["provision"]);
                throw new Error("Provisioning failed");
            }
        }
    });

    await assert.rejects(
        () => service.create(input, context),
        /Provisioning failed/
    );

    assert.deepEqual(
        calls.map(call => call[0]),
        ["start", "provision", "fail"]
    );

    assert.equal(
        calls[2][2],
        "TENANT_PROVISIONING_FAILED"
    );
});

test("provisioning and audit failure are both preserved", async () => {
    const { service } = createFixture({
        provisioning: {
            create: async () => {
                throw new Error("Provisioning failed");
            }
        },
        audit: {
            fail: async () => {
                throw new Error("Audit finalization failed");
            }
        }
    });

    await assert.rejects(
        () => service.create(input, context),
        error => {
            assert.ok(error instanceof AggregateError);
            assert.equal(error.errors.length, 2);
            return true;
        }
    );
});

test("successful commit followed by audit failure is not marked failed", async () => {
    const { service, calls } = createFixture({
        audit: {
            succeed: async () => {
                calls.push(["succeed"]);
                throw new Error("Success audit unavailable");
            }
        }
    });

    await assert.rejects(
        () => service.create(input, context),
        /Success audit unavailable/
    );

    assert.deepEqual(
        calls.map(call => call[0]),
        ["start", "provision", "succeed"]
    );
});

test("invalid tenant input is rejected before auditing or provisioning", async () => {
    const { service, calls } = createFixture();

    await assert.rejects(
        () => service.create(
            {
                code: "?",
                displayName: "X",
                countryCode: "?"
            },
            context
        )
    );

    assert.equal(calls.length, 0);
});

test("rollback failure preserves STARTED audit for reconciliation", async () => {
    const calls = [];

    const provisioningError = new Error(
        "Tenant insertion failed"
    );

    const rollbackError = new Error(
        "Database rollback failed"
    );

const uncertainOutcome = new TenantTransactionOutcomeError(
    provisioningError,
    rollbackError
);

    const provisioning = {
        create: async () => {
            calls.push("provision");
            throw uncertainOutcome;
        }
    };

    const audit = {
        start: async () => {
            calls.push("start");
            return "55555555-5555-4555-8555-555555555555";
        },

        succeed: async () => {
            calls.push("succeed");
        },

        fail: async () => {
            calls.push("fail");
        }
    };

    const service = new AuditedTenantProvisioningService(
        provisioning,
        audit
    );

    await assert.rejects(
        () => service.create(input, context),
        error => {
            assert.equal(error, uncertainOutcome);
            assert.equal(error.errors.length, 2);
            return true;
        }
    );

    assert.deepEqual(calls, [
        "start",
        "provision"
    ]);
});

test("unrelated AggregateError follows normal failure auditing", async () => {
    const calls = [];

    const provisioningError = new AggregateError(
        [
            new Error("First operation failed"),
            new Error("Second operation failed")
        ],
        "Multiple provisioning operations failed"
    );

    const provisioning = {
        create: async () => {
            calls.push("provision");
            throw provisioningError;
        }
    };

    const audit = {
        start: async () => {
            calls.push("start");
            return "55555555-5555-4555-8555-555555555555";
        },

        succeed: async () => {
            calls.push("succeed");
        },

        fail: async () => {
            calls.push("fail");
        }
    };

    const service = new AuditedTenantProvisioningService(
        provisioning,
        audit
    );

    await assert.rejects(
        () => service.create(input, context),
        error => {
            assert.equal(error, provisioningError);
            return true;
        }
    );

    assert.deepEqual(calls, [
        "start",
        "provision",
        "fail"
    ]);
});
