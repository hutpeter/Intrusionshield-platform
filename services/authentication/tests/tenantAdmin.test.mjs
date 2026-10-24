
import test from "node:test";
import assert from "node:assert/strict";

import { PlatformTenantAuthorization } from "../dist/application/PlatformTenantAuthorization.js";
import { TenantAuthorizationAudit } from "../dist/application/TenantAuthorizationAudit.js";
import { TenantProvisioningService } from "../dist/application/TenantProvisioningService.js";

const identity = "11111111-1111-4111-8111-111111111111";
const tenant = "22222222-2222-4222-8222-222222222222";

const validInput = {
    code: "demo",
    displayName: "Demo Tenant",
    countryCode: "CA"
};

function createProvisioningMocks() {
    const steps = [];

    const database = {
        beginTransaction: async () => {
            steps.push("begin");
        },
        commitTransaction: async () => {
            steps.push("commit");
        },
        rollbackTransaction: async () => {
            steps.push("rollback");
        }
    };

    const tenants = {
        create: async () => {
            steps.push("tenant");

            return {
                id: tenant,
                code: "DEMO",
                displayName: "Demo Tenant",
                countryCode: "CA"
            };
        }
    };

    const configuration = {
        create: async () => {
            steps.push("config");
        }
    };

    const events = [];

    const outbox = {
        append: async event => {
            steps.push("outbox");
            events.push(event);
        }
    };

    return {
        steps,
        database,
        tenants,
        configuration,
        outbox,
        events
    };
}

test("platform authorization permits only an explicit positive result", async () => {
    for (const [value, expected] of [
        [1, true],
        [0, false],
        [undefined, false]
    ]) {
        const database = {
            query: async () => ({
                rows: value === undefined
                    ? []
                    : [{ allowed: value }]
            })
        };

        assert.equal(
            await new PlatformTenantAuthorization(database)
                .allowed(identity, tenant, "READ"),
            expected
        );
    }
});

test("malformed identity fails closed without a database query", async () => {
    const database = {
        query: async () => {
            throw Error("must not query");
        }
    };

    assert.equal(
        await new PlatformTenantAuthorization(database)
            .allowed("invalid", tenant, "CREATE"),
        false
    );
});

test("authorization database errors fail closed by rejecting", async () => {
    const database = {
        query: async () => {
            throw Error("database unavailable");
        }
    };

    await assert.rejects(
        new PlatformTenantAuthorization(database)
            .allowed(identity, tenant, "READ")
    );
});

test("authorization audit persists granted and denied decisions", async () => {
    const calls = [];

    const database = {
        execute: async (...args) => {
            calls.push(args);
            return 1;
        }
    };

    const audit = new TenantAuthorizationAudit(database);

    await audit.record(identity, tenant, "READ", true);
    await audit.record(identity, tenant, "CREATE", false);

    assert.equal(calls.length, 2);
    assert.match(calls[0][0], /AuthorizationAudit/);

    assert.equal(
        calls[0][1].find(p => p.name === "allowed").value,
        true
    );

    assert.equal(
        calls[1][1].find(p => p.name === "allowed").value,
        false
    );
});

test("audit write failure propagates and cannot be mistaken for success", async () => {
    const database = {
        execute: async () => {
            throw Error("audit unavailable");
        }
    };

    await assert.rejects(
        new TenantAuthorizationAudit(database)
            .record(identity, tenant, "READ", true)
    );
});

test("provisioning commits tenant, configuration, and outbox together", async () => {
    const mocks = createProvisioningMocks();

    const result = await new TenantProvisioningService(
        mocks.database,
        mocks.tenants,
        mocks.configuration,
        mocks.outbox
    ).create(validInput);

    assert.equal(result.id, tenant);

    assert.deepEqual(mocks.steps, [
        "begin",
        "tenant",
        "config",
        "outbox",
        "commit"
    ]);

    assert.equal(mocks.events.length, 1);
});

test("provisioning creates a correctly structured tenant event", async () => {
    const mocks = createProvisioningMocks();

    await new TenantProvisioningService(
        mocks.database,
        mocks.tenants,
        mocks.configuration,
        mocks.outbox
    ).create(validInput);

    const event = mocks.events[0];

    assert.match(
        event.id,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    assert.equal(event.type, "tenant.created");
    assert.equal(event.version, "1.0");
    assert.equal(event.tenantId, tenant);
    assert.equal(event.source, "ruby.authentication");
    assert.ok(event.timestamp instanceof Date);

    assert.deepEqual(event.payload, {
        tenantId: tenant,
        code: "DEMO",
        displayName: "Demo Tenant",
        countryCode: "CA"
    });
});

test("provisioning rolls back if initial configuration fails", async () => {
    const mocks = createProvisioningMocks();

    mocks.configuration.create = async () => {
        mocks.steps.push("config");
        throw Error("configuration failure");
    };

    await assert.rejects(
        new TenantProvisioningService(
            mocks.database,
            mocks.tenants,
            mocks.configuration,
            mocks.outbox
        ).create(validInput),
        /configuration failure/
    );

    assert.deepEqual(mocks.steps, [
        "begin",
        "tenant",
        "config",
        "rollback"
    ]);

    assert.equal(mocks.events.length, 0);
});

test("provisioning rolls back if outbox persistence fails", async () => {
    const mocks = createProvisioningMocks();

    mocks.outbox.append = async () => {
        mocks.steps.push("outbox");
        throw Error("outbox unavailable");
    };

    await assert.rejects(
        new TenantProvisioningService(
            mocks.database,
            mocks.tenants,
            mocks.configuration,
            mocks.outbox
        ).create(validInput),
        /outbox unavailable/
    );

    assert.deepEqual(mocks.steps, [
        "begin",
        "tenant",
        "config",
        "outbox",
        "rollback"
    ]);
});

test("provisioning reports both errors if rollback also fails", async () => {
    const mocks = createProvisioningMocks();

    mocks.outbox.append = async () => {
        mocks.steps.push("outbox");
        throw Error("outbox unavailable");
    };

    mocks.database.rollbackTransaction = async () => {
        mocks.steps.push("rollback");
        throw Error("rollback unavailable");
    };

    await assert.rejects(
        new TenantProvisioningService(
            mocks.database,
            mocks.tenants,
            mocks.configuration,
            mocks.outbox
        ).create(validInput),
        error => {
            assert.ok(error instanceof AggregateError);
            assert.equal(error.errors.length, 2);
            assert.match(
                error.errors[0].message,
                /outbox unavailable/
            );
            assert.match(
                error.errors[1].message,
                /rollback unavailable/
            );
            return true;
        }
    );

    assert.ok(!mocks.steps.includes("commit"));
});

test("authorization audit safely stores malformed UUID claims as NULL", async () => {
    const calls = [];

    const database = {
        execute: async (...args) => {
            calls.push(args);
            return 1;
        }
    };

    const audit = new TenantAuthorizationAudit(database);

    await audit.record(
        "invalid-identity",
        tenant,
        "READ",
        false
    );

    await audit.record(
        identity,
        "invalid-tenant",
        "CREATE",
        false
    );

    assert.equal(
        calls[0][1].find(p => p.name === "identityId").value,
        null
    );

    assert.equal(
        calls[0][1].find(p => p.name === "tenantId").value,
        tenant
    );

    assert.equal(
        calls[1][1].find(p => p.name === "identityId").value,
        identity
    );

    assert.equal(
        calls[1][1].find(p => p.name === "tenantId").value,
        null
    );

    assert.ok(
        calls.every(
            call =>
                call[1].find(p => p.name === "allowed").value === false
        )
    );
});

test("reconciliation requires its own platform permission resource", async () => {
    const calls = [];

    const database = {
        query: async (sql, parameters) => {
            calls.push({ sql, parameters });

            const resource = parameters.find(
                parameter => parameter.name === "resource"
            )?.value;

            const action = parameters.find(
                parameter => parameter.name === "action"
            )?.value;

            return {
                rows: [{
                    allowed:
                        resource === "platform.tenants" &&
                        action === "READ"
                            ? 1
                            : 0
                }]
            };
        }
    };

    const authorization =
        new PlatformTenantAuthorization(database);

    assert.equal(
        await authorization.allowed(identity, tenant, "READ"),
        true
    );

    assert.equal(
        await authorization.allowed(
            identity,
            tenant,
            "READ",
            "platform.tenant-provisioning-audit"
        ),
        false
    );

    assert.equal(calls.length, 2);

    assert.ok(
        calls.every(call =>
            call.sql.includes("p.Resource = @resource")
        )
    );

    assert.equal(
        calls[1].parameters.find(
            parameter => parameter.name === "resource"
        ).value,
        "platform.tenant-provisioning-audit"
    );
});

test("explicit reconciliation READ permission is accepted", async () => {
    const database = {
        query: async (_sql, parameters) => {
            const resource = parameters.find(
                parameter => parameter.name === "resource"
            )?.value;

            const action = parameters.find(
                parameter => parameter.name === "action"
            )?.value;

            return {
                rows: [{
                    allowed:
                        resource === "platform.tenant-provisioning-audit" &&
                        action === "READ"
                            ? 1
                            : 0
                }]
            };
        }
    };

    assert.equal(
        await new PlatformTenantAuthorization(database)
            .allowed(
                identity,
                tenant,
                "READ",
                "platform.tenant-provisioning-audit"
            ),
        true
    );
});

test("reconciliation CREATE permission fails closed without querying", async () => {
    const database = {
        query: async () => {
            throw Error("Database must not be queried");
        }
    };

    assert.equal(
        await new PlatformTenantAuthorization(database)
            .allowed(
                identity,
                tenant,
                "CREATE",
                "platform.tenant-provisioning-audit"
            ),
        false
    );
});

test("reconciliation rejects malformed identities before querying", async () => {
    const database = {
        query: async () => {
            throw Error("Database must not be queried");
        }
    };

    const authorization =
        new PlatformTenantAuthorization(database);

    assert.equal(
        await authorization.allowed(
            "invalid",
            tenant,
            "READ",
            "platform.tenant-provisioning-audit"
        ),
        false
    );

    assert.equal(
        await authorization.allowed(
            identity,
            "invalid",
            "READ",
            "platform.tenant-provisioning-audit"
        ),
        false
    );
});

test("reconciliation authorization database failures propagate", async () => {
    const database = {
        query: async () => {
            throw Error("Authorization database unavailable");
        }
    };

    await assert.rejects(
        new PlatformTenantAuthorization(database)
            .allowed(
                identity,
                tenant,
                "READ",
                "platform.tenant-provisioning-audit"
            ),
        /Authorization database unavailable/
    );
});

test("reconciliation authorization audit records its own resource", async () => {
    const calls = [];

    const database = {
        execute: async (sql, parameters) => {
            calls.push({ sql, parameters });
            return 1;
        }
    };

    const audit = new TenantAuthorizationAudit(database);

    await audit.record(
        identity,
        tenant,
        "READ",
        true,
        "platform.tenant-provisioning-audit"
    );

    await audit.record(
        identity,
        tenant,
        "READ",
        false,
        "platform.tenant-provisioning-audit"
    );

    assert.equal(calls.length, 2);

    for (const call of calls) {
        assert.match(
            call.sql,
            /INSERT INTO \[Identity\]\.\[AuthorizationAudit\]/
        );

        assert.equal(
            call.parameters.find(p => p.name === "resource").value,
            "platform.tenant-provisioning-audit"
        );

        assert.equal(
            call.parameters.find(p => p.name === "action").value,
            "READ"
        );
    }

    assert.equal(
        calls[0].parameters.find(p => p.name === "allowed").value,
        true
    );

    assert.equal(
        calls[1].parameters.find(p => p.name === "allowed").value,
        false
    );
});

test("reconciliation authorization audit rejects CREATE", async () => {
    let writes = 0;

    const database = {
        execute: async () => {
            writes++;
            return 1;
        }
    };

    await assert.rejects(
        new TenantAuthorizationAudit(database).record(
            identity,
            tenant,
            "CREATE",
            false,
            "platform.tenant-provisioning-audit"
        ),
        /Invalid tenant provisioning audit permission action/
    );

    assert.equal(writes, 0);
});

test("reconciliation authorization audit write failures propagate", async () => {
    const database = {
        execute: async () => {
            throw Error("Reconciliation authorization audit unavailable");
        }
    };

    await assert.rejects(
        new TenantAuthorizationAudit(database).record(
            identity,
            tenant,
            "READ",
            true,
            "platform.tenant-provisioning-audit"
        ),
        /Reconciliation authorization audit unavailable/
    );
});
