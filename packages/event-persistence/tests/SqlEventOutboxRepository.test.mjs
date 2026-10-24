
import test from "node:test";
import assert from "node:assert/strict";
import { SqlEventOutboxRepository } from "../dist/index.js";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const TIMESTAMP = new Date("2026-10-21T12:00:00.000Z");

function createEvent(overrides = {}) {
    return {
        id: EVENT_ID,
        type: "tenant.created",
        version: "1.0",
        timestamp: TIMESTAMP,
        tenantId: TENANT_ID,
        userId: "33333333-3333-4333-8333-333333333333",
        correlationId: "request-123",
        causationId: "command-456",
        source: "ruby.authentication",
        payload: {
            tenantId: TENANT_ID,
            code: "DEMO",
            countryCode: "CA"
        },
        ...overrides
    };
}

function createDatabase() {
    const calls = [];

    return {
        calls,
        database: {
            execute: async (sql, parameters) => {
                calls.push({ sql, parameters });
                return 1;
            }
        }
    };
}

function parameterValue(call, name) {
    return call.parameters.find(
        parameter => parameter.name === name
    )?.value;
}

test("persists an event as a pending outbox record", async () => {
    const { database, calls } = createDatabase();
    const event = createEvent();

    await new SqlEventOutboxRepository(database).append(event);

    assert.equal(calls.length, 1);

    const call = calls[0];

    assert.match(call.sql, /INSERT INTO \[Platform\]\.\[EventOutbox\]/);
    assert.match(call.sql, /N'PENDING'/);
    assert.equal(parameterValue(call, "id"), EVENT_ID);
    assert.equal(parameterValue(call, "tenantId"), TENANT_ID);
    assert.equal(parameterValue(call, "eventType"), "tenant.created");
    assert.equal(parameterValue(call, "createdAt"), TIMESTAMP);

    assert.deepEqual(
        JSON.parse(parameterValue(call, "payload")),
        event.payload
    );
});

test("preserves event metadata", async () => {
    const { database, calls } = createDatabase();

    await new SqlEventOutboxRepository(database).append(
        createEvent()
    );

    const metadata = JSON.parse(
        parameterValue(calls[0], "metadata")
    );

    assert.deepEqual(metadata, {
        version: "1.0",
        userId: "33333333-3333-4333-8333-333333333333",
        correlationId: "request-123",
        causationId: "command-456",
        source: "ruby.authentication"
    });
});

test("supports platform-wide events without a tenant", async () => {
    const { database, calls } = createDatabase();

    await new SqlEventOutboxRepository(database).append(
        createEvent({ tenantId: undefined })
    );

    assert.equal(
        parameterValue(calls[0], "tenantId"),
        null
    );
});

test("rejects invalid event identifiers without writing SQL", async () => {
    const { database, calls } = createDatabase();
    const repository = new SqlEventOutboxRepository(database);

    for (const id of ["", "invalid", null, undefined]) {
        await assert.rejects(
            repository.append(createEvent({ id })),
            /valid UUID/
        );
    }

    assert.equal(calls.length, 0);
});

test("rejects invalid event types without writing SQL", async () => {
    const { database, calls } = createDatabase();
    const repository = new SqlEventOutboxRepository(database);

    for (const type of ["", "   ", "x".repeat(201), null]) {
        await assert.rejects(
            repository.append(createEvent({ type })),
            /Event type/
        );
    }

    assert.equal(calls.length, 0);
});

test("rejects invalid timestamps without writing SQL", async () => {
    const { database, calls } = createDatabase();
    const repository = new SqlEventOutboxRepository(database);

    for (const timestamp of [
        "2026-10-21",
        new Date("invalid"),
        null
    ]) {
        await assert.rejects(
            repository.append(createEvent({ timestamp })),
            /valid Date/
        );
    }

    assert.equal(calls.length, 0);
});

test("rejects an undefined event payload", async () => {
    const { database, calls } = createDatabase();

    await assert.rejects(
        new SqlEventOutboxRepository(database).append(
            createEvent({ payload: undefined })
        ),
        /JSON serializable/
    );

    assert.equal(calls.length, 0);
});

test("rejects circular payloads without writing SQL", async () => {
    const { database, calls } = createDatabase();
    const circular = {};
    circular.self = circular;

    await assert.rejects(
        new SqlEventOutboxRepository(database).append(
            createEvent({ payload: circular })
        )
    );

    assert.equal(calls.length, 0);
});

test("propagates database write failures", async () => {
    const database = {
        execute: async () => {
            throw new Error("SQL Server unavailable");
        }
    };

    await assert.rejects(
        new SqlEventOutboxRepository(database).append(
            createEvent()
        ),
        /SQL Server unavailable/
    );
});

test("does not begin or commit transactions itself", async () => {
    const { database, calls } = createDatabase();

    database.beginTransaction = async () => {
        throw new Error("Repository must not begin transactions");
    };

    database.commitTransaction = async () => {
        throw new Error("Repository must not commit transactions");
    };

    await new SqlEventOutboxRepository(database).append(
        createEvent()
    );

    assert.equal(calls.length, 1);
});

test("rejects unsupported nested payload values", async () => {
    const { database, calls } = createDatabase();
    const repository = new SqlEventOutboxRepository(database);

    const invalidPayloads = [
        { nested: { value: undefined } },
        { nested: { value: () => "invalid" } },
        { nested: { value: Symbol("invalid") } },
        { nested: { value: 123n } },
        { nested: { value: Number.NaN } },
        { nested: { value: Infinity } },
        { nested: { value: -Infinity } },
        { nested: { value: new Date() } }
    ];

    for (const payload of invalidPayloads) {
        await assert.rejects(
            repository.append(createEvent({ payload }))
        );
    }

    assert.equal(calls.length, 0);
});

test("rejects sparse arrays and undefined array elements", async () => {
    const { database, calls } = createDatabase();
    const repository = new SqlEventOutboxRepository(database);

    const sparse = new Array(2);
    sparse[0] = "valid";

    for (const payload of [
        { values: sparse },
        { values: ["valid", undefined] }
    ]) {
        await assert.rejects(
            repository.append(createEvent({ payload }))
        );
    }

    assert.equal(calls.length, 0);
});

test("rejects invalid tenant IDs without writing SQL", async () => {
    const { database, calls } = createDatabase();
    const repository = new SqlEventOutboxRepository(database);

    for (const tenantId of ["invalid", "", null]) {
        await assert.rejects(
            repository.append(createEvent({ tenantId })),
            /tenant ID/
        );
    }

    assert.equal(calls.length, 0);
});

test("rejects accessor and symbol properties", async () => {
    const { database, calls } = createDatabase();
    const repository = new SqlEventOutboxRepository(database);

    const accessorPayload = {};
    Object.defineProperty(accessorPayload, "secret", {
        enumerable: true,
        get() {
            return "unexpected";
        }
    });

    const symbolPayload = {
        [Symbol("hidden")]: "value"
    };

    for (const payload of [accessorPayload, symbolPayload]) {
        await assert.rejects(
            repository.append(createEvent({ payload }))
        );
    }

    assert.equal(calls.length, 0);
});

test("accepts ordinary nested JSON payloads", async () => {
    const { database, calls } = createDatabase();

    const payload = {
        tenant: {
            code: "DEMO",
            enabled: true,
            limits: [10, 20, null],
            settings: {
                language: "en",
                notifications: false
            }
        }
    };

    await new SqlEventOutboxRepository(database).append(
        createEvent({ payload })
    );

    assert.equal(calls.length, 1);
    assert.deepEqual(
        JSON.parse(parameterValue(calls[0], "payload")),
        payload
    );
});

