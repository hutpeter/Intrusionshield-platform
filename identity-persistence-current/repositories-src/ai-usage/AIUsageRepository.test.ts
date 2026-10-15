import {
jest,
describe,
beforeEach,
expect,
test
} from "@jest/globals";

import type { DatabaseManager } from "@intrusionshield/database";
import type { AIUsageRecord } from "@intrusionshield/contracts";

import { AIUsageRepository } from "./AIUsageRepository.js";

describe("AIUsageRepository", () => {
let database: {
query: jest.Mock;
execute: jest.Mock;
};


let repository: AIUsageRepository;

beforeEach(() => {
    database = {
        query: jest.fn(),
        execute: jest.fn()
    };

    repository = new AIUsageRepository(
        database as unknown as DatabaseManager
    );
});

test("creates an AI usage record", async () => {
    database.execute.mockResolvedValue(1);

    const record: AIUsageRecord = {
        id: "usage-1",
        tenantId: "tenant-1",
        userId: "user-1",
        applicationId: "app-1",
        provider: "openai",
        model: "gpt-5",
        requestType: "chat",
        status: "pending",
        correlationId: "corr-1",
        startedAt: "2026-09-02T12:00:00.000Z",
        source: "ai-hub",
        createdAt: "2026-09-02T12:00:00.000Z"
    };

    await repository.create(record);

    expect(database.execute).toHaveBeenCalledTimes(1);

    const [sql, parameters] =
        database.execute.mock.calls[0];

    expect(sql).toContain(
        "INSERT INTO core.AIUsageRecords"
    );
    expect(sql).toContain("@tenantId");
    expect(sql).toContain("@id");

    expect(parameters).toEqual(
        expect.arrayContaining([
            { name: "id", value: "usage-1" },
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "provider",
                value: "openai"
            },
            {
                name: "model",
                value: "gpt-5"
            },
            {
                name: "requestType",
                value: "chat"
            },
            {
                name: "status",
                value: "pending"
            }
        ])
    );
});

test("creates an AI usage record with null optional database values", async () => {
    database.execute.mockResolvedValue(1);

    const record: AIUsageRecord = {
        id: "usage-null",
        tenantId: "tenant-1",
        provider: "openai",
        model: "gpt-5",
        requestType: "chat",
        status: "pending",
        startedAt: "2026-09-02T12:00:00.000Z",
        source: "ai-hub",
        createdAt: "2026-09-02T12:00:00.000Z"
    };

    await repository.create(record);

    const [, parameters] =
        database.execute.mock.calls[0];

    expect(parameters).toEqual(
        expect.arrayContaining([
            {
                name: "userId",
                value: null
            },
            {
                name: "applicationId",
                value: null
            },
            {
                name: "correlationId",
                value: null
            },
            {
                name: "completedAt",
                value: null
            },
            {
                name: "latencyMs",
                value: null
            },
            {
                name: "inputTokens",
                value: null
            },
            {
                name: "outputTokens",
                value: null
            },
            {
                name: "totalTokens",
                value: null
            },
            {
                name: "estimatedCost",
                value: null
            },
            {
                name: "currency",
                value: null
            },
            {
                name: "errorCode",
                value: null
            },
            {
                name: "providerRequestId",
                value: null
            }
        ])
    );
});

test("updates only the mutable lifecycle fields", async () => {
    database.execute.mockResolvedValue(1);

    const record: AIUsageRecord = {
        id: "usage-1",
        tenantId: "tenant-1",
        provider: "openai",
        model: "gpt-5",
        requestType: "chat",
        status: "success",
        startedAt: "2026-09-02T12:00:00.000Z",
        completedAt: "2026-09-02T12:00:02.000Z",
        latencyMs: 2000,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
        currency: "USD",
        providerRequestId: "provider-request-1",
        source: "ai-hub",
        createdAt: "2026-09-02T12:00:00.000Z"
    };

    await repository.update(record);

    const [sql, parameters] =
        database.execute.mock.calls[0];

    expect(sql).toContain(
        "UPDATE core.AIUsageRecords"
    );
    expect(sql).toContain(
        "WHERE tenant_id = @tenantId"
    );
    expect(sql).toContain("AND id = @id");

    expect(parameters).toEqual(
        expect.arrayContaining([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "id",
                value: "usage-1"
            },
            {
                name: "status",
                value: "success"
            },
            {
                name: "completedAt",
                value: "2026-09-02T12:00:02.000Z"
            },
            {
                name: "latencyMs",
                value: 2000
            },
            {
                name: "inputTokens",
                value: 100
            },
            {
                name: "outputTokens",
                value: 50
            },
            {
                name: "totalTokens",
                value: 150
            },
            {
                name: "estimatedCost",
                value: 0.01
            },
            {
                name: "providerRequestId",
                value: "provider-request-1"
            }
        ])
    );

    expect(sql).not.toContain(
        "SET tenant_id"
    );
    expect(sql).not.toContain(
        "SET provider ="
    );
    expect(sql).not.toContain(
        "SET model ="
    );
    expect(sql).not.toContain(
        "SET request_type ="
    );
});

test("updates optional fields as null when the contract omits them", async () => {
    database.execute.mockResolvedValue(1);

    const record: AIUsageRecord = {
        id: "usage-null-update",
        tenantId: "tenant-1",
        provider: "openai",
        model: "gpt-5",
        requestType: "chat",
        status: "error",
        startedAt: "2026-09-02T12:00:00.000Z",
        source: "ai-hub",
        createdAt: "2026-09-02T12:00:00.000Z"
    };

    await repository.update(record);

    const [, parameters] =
        database.execute.mock.calls[0];

    expect(parameters).toEqual(
        expect.arrayContaining([
            {
                name: "completedAt",
                value: null
            },
            {
                name: "latencyMs",
                value: null
            },
            {
                name: "inputTokens",
                value: null
            },
            {
                name: "outputTokens",
                value: null
            },
            {
                name: "totalTokens",
                value: null
            },
            {
                name: "estimatedCost",
                value: null
            },
            {
                name: "currency",
                value: null
            },
            {
                name: "errorCode",
                value: null
            },
            {
                name: "providerRequestId",
                value: null
            }
        ])
    );
});

test("returns a record for the correct tenant and maps database fields", async () => {
    database.query.mockResolvedValue({
        rows: [
            {
                id: "usage-1",
                tenant_id: "tenant-1",
                user_id: "user-1",
                application_id: "app-1",
                provider: "openai",
                model: "gpt-5",
                request_type: "chat",
                status: "success",
                correlation_id: "corr-1",
                started_at:
                    new Date(
                        "2026-09-02T12:00:00.000Z"
                    ),
                completed_at:
                    new Date(
                        "2026-09-02T12:00:02.000Z"
                    ),
                latency_ms: 2000,
                input_tokens: 100,
                output_tokens: 50,
                total_tokens: 150,
                estimated_cost: 0.01,
                currency: "USD",
                error_code: null,
                provider_request_id:
                    "provider-request-1",
                source: "ai-hub",
                created_at:
                    new Date(
                        "2026-09-02T12:00:00.000Z"
                    )
            }
        ],
        rowCount: 1
    });

    const result =
        await repository.getById(
            "tenant-1",
            "usage-1"
        );

    expect(result).toEqual({
        id: "usage-1",
        tenantId: "tenant-1",
        userId: "user-1",
        applicationId: "app-1",
        provider: "openai",
        model: "gpt-5",
        requestType: "chat",
        status: "success",
        correlationId: "corr-1",
        startedAt:
            "2026-09-02T12:00:00.000Z",
        completedAt:
            "2026-09-02T12:00:02.000Z",
        latencyMs: 2000,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        estimatedCost: 0.01,
        currency: "USD",
        providerRequestId:
            "provider-request-1",
        source: "ai-hub",
        createdAt:
            "2026-09-02T12:00:00.000Z"
    });

    const [sql, parameters] =
        database.query.mock.calls[0];

    expect(sql).toContain(
        "WHERE tenant_id = @tenantId"
    );
    expect(sql).toContain(
        "AND id = @id"
    );

    expect(parameters).toEqual([
        {
            name: "tenantId",
            value: "tenant-1"
        },
        {
            name: "id",
            value: "usage-1"
        }
    ]);
});

test("maps nullable database fields to omitted contract properties", async () => {
    database.query.mockResolvedValue({
        rows: [
            {
                id: "usage-minimal",
                tenant_id: "tenant-1",
                user_id: null,
                application_id: null,
                provider: "openai",
                model: "gpt-5",
                request_type: "chat",
                status: "pending",
                correlation_id: null,
                started_at:
                    "2026-09-02T12:00:00.000Z",
                completed_at: null,
                latency_ms: null,
                input_tokens: null,
                output_tokens: null,
                total_tokens: null,
                estimated_cost: null,
                currency: null,
                error_code: null,
                provider_request_id: null,
                source: "ai-hub",
                created_at:
                    "2026-09-02T12:00:00.000Z"
            }
        ],
        rowCount: 1
    });

    const result =
        await repository.getById(
            "tenant-1",
            "usage-minimal"
        );

    expect(result).toEqual({
        id: "usage-minimal",
        tenantId: "tenant-1",
        provider: "openai",
        model: "gpt-5",
        requestType: "chat",
        status: "pending",
        startedAt:
            "2026-09-02T12:00:00.000Z",
        source: "ai-hub",
        createdAt:
            "2026-09-02T12:00:00.000Z"
    });
});

test("converts string database costs to numbers", async () => {
    database.query.mockResolvedValue({
        rows: [
            {
                id: "usage-cost",
                tenant_id: "tenant-1",
                user_id: null,
                application_id: null,
                provider: "openai",
                model: "gpt-5",
                request_type: "completion",
                status: "success",
                correlation_id: null,
                started_at:
                    "2026-09-02T12:00:00.000Z",
                completed_at:
                    "2026-09-02T12:00:01.000Z",
                latency_ms: 1000,
                input_tokens: 10,
                output_tokens: 20,
                total_tokens: 30,
                estimated_cost: "0.0125",
                currency: "USD",
                error_code: null,
                provider_request_id: null,
                source: "ai-hub",
                created_at:
                    "2026-09-02T12:00:00.000Z"
            }
        ],
        rowCount: 1
    });

    const result =
        await repository.getById(
            "tenant-1",
            "usage-cost"
        );

    expect(result?.estimatedCost).toBe(0.0125);
});

test("returns null when the record does not exist", async () => {
    database.query.mockResolvedValue({
        rows: [],
        rowCount: 0
    });

    await expect(
        repository.getById(
            "tenant-1",
            "missing"
        )
    ).resolves.toBeNull();
});

test("lists records with tenant and period filters", async () => {
    database.query.mockResolvedValue({
        rows: [],
        rowCount: 0
    });

    await repository.listByTenant(
        "tenant-1",
        "2026-09-01T00:00:00.000Z",
        "2026-09-02T23:59:59.999Z"
    );

    const [sql, parameters] =
        database.query.mock.calls[0];

    expect(sql).toContain(
        "WHERE tenant_id = @tenantId"
    );
    expect(sql).toContain(
        "AND started_at >= @periodStart"
    );
    expect(sql).toContain(
        "AND started_at <= @periodEnd"
    );
    expect(sql).toContain(
        "ORDER BY started_at DESC, id DESC"
    );

    expect(parameters).toEqual([
        {
            name: "tenantId",
            value: "tenant-1"
        },
        {
            name: "periodStart",
            value:
                "2026-09-01T00:00:00.000Z"
        },
        {
            name: "periodEnd",
            value:
                "2026-09-02T23:59:59.999Z"
        }
    ]);
});

test("lists records with only a period start filter", async () => {
    database.query.mockResolvedValue({
        rows: [],
        rowCount: 0
    });

    await repository.listByTenant(
        "tenant-1",
        "2026-09-01T00:00:00.000Z"
    );

    const [sql, parameters] =
        database.query.mock.calls[0];

    expect(sql).toContain(
        "WHERE tenant_id = @tenantId"
    );
    expect(sql).toContain(
        "AND started_at >= @periodStart"
    );
    expect(sql).not.toContain(
        "AND started_at <= @periodEnd"
    );

    expect(parameters).toEqual([
        {
            name: "tenantId",
            value: "tenant-1"
        },
        {
            name: "periodStart",
            value:
                "2026-09-01T00:00:00.000Z"
        }
    ]);
});

test("lists records with only a period end filter", async () => {
    database.query.mockResolvedValue({
        rows: [],
        rowCount: 0
    });

    await repository.listByTenant(
        "tenant-1",
        undefined,
        "2026-09-02T23:59:59.999Z"
    );

    const [sql, parameters] =
        database.query.mock.calls[0];

    expect(sql).toContain(
        "WHERE tenant_id = @tenantId"
    );
    expect(sql).not.toContain(
        "AND started_at >= @periodStart"
    );
    expect(sql).toContain(
        "AND started_at <= @periodEnd"
    );

    expect(parameters).toEqual([
        {
            name: "tenantId",
            value: "tenant-1"
        },
        {
            name: "periodEnd",
            value:
                "2026-09-02T23:59:59.999Z"
        }
    ]);
});

test("lists records without period filters", async () => {
    database.query.mockResolvedValue({
        rows: [],
        rowCount: 0
    });

    await repository.listByTenant(
        "tenant-1"
    );

    const [sql, parameters] =
        database.query.mock.calls[0];

    expect(sql).toContain(
        "WHERE tenant_id = @tenantId"
    );
    expect(sql).not.toContain(
        "@periodStart"
    );
    expect(sql).not.toContain(
        "@periodEnd"
    );

    expect(parameters).toEqual([
        {
            name: "tenantId",
            value: "tenant-1"
        }
    ]);
});

test("maps rows returned by listByTenant", async () => {
    database.query.mockResolvedValue({
        rows: [
            {
                id: "usage-2",
                tenant_id: "tenant-1",
                user_id: null,
                application_id: "app-2",
                provider: "anthropic",
                model: "claude",
                request_type: "chat",
                status: "success",
                correlation_id: null,
                started_at:
                    "2026-09-02T14:00:00.000Z",
                completed_at:
                    "2026-09-02T14:00:01.000Z",
                latency_ms: 1000,
                input_tokens: 25,
                output_tokens: 75,
                total_tokens: 100,
                estimated_cost: "0.02",
                currency: "USD",
                error_code: null,
                provider_request_id: null,
                source: "ai-hub",
                created_at:
                    "2026-09-02T14:00:00.000Z"
            }
        ],
        rowCount: 1
    });

    const result =
        await repository.listByTenant(
            "tenant-1"
        );

    expect(result).toEqual([
        {
            id: "usage-2",
            tenantId: "tenant-1",
            applicationId: "app-2",
            provider: "anthropic",
            model: "claude",
            requestType: "chat",
            status: "success",
            startedAt:
                "2026-09-02T14:00:00.000Z",
            completedAt:
                "2026-09-02T14:00:01.000Z",
            latencyMs: 1000,
            inputTokens: 25,
            outputTokens: 75,
            totalTokens: 100,
            estimatedCost: 0.02,
            currency: "USD",
            providerRequestId: undefined,
            source: "ai-hub",
            createdAt:
                "2026-09-02T14:00:00.000Z"
        }
    ]);
});

test("enforces tenant isolation when retrieving a record", async () => {
    database.query.mockResolvedValue({
        rows: [],
        rowCount: 0
    });

    await repository.getById(
        "tenant-b",
        "usage-1"
    );

    const [sql, parameters] =
        database.query.mock.calls[0];

    expect(sql).toContain(
        "tenant_id = @tenantId"
    );

    expect(parameters).toEqual([
        {
            name: "tenantId",
            value: "tenant-b"
        },
        {
            name: "id",
            value: "usage-1"
        }
    ]);
});


});
