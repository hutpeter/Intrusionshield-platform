`packages/repositories/src/ai-usage/IPerformanceRepository.test.ts`


import {
    jest,
    describe,
    beforeEach,
    expect,
    test
} from "@jest/globals";
import type { DatabaseManager } from "@intrusionshield/database";
import type { AIPerformanceRecord } from "@intrusionshield/contracts";
import { AIPerformanceRepository } from "./AIPerformanceRepository.js";

describe("AIPerformanceRepository", () => {
    let database: {
        query: jest.Mock;
        execute: jest.Mock;
    };

    let repository: AIPerformanceRepository;

    beforeEach(() => {
        database = {
            query: jest.fn(),
            execute: jest.fn()
        };

        repository = new AIPerformanceRepository(
            database as unknown as DatabaseManager
        );
    });

    test("creates a performance record", async () => {
        database.execute.mockResolvedValue(1);

        const record: AIPerformanceRecord = {
            id: "performance-1",
            usageRecordId: "usage-1",
            tenantId: "tenant-1",
            provider: "openai",
            model: "gpt-5",
            requestType: "chat",
            latencyMs: 1500,
            timeToFirstTokenMs: 300,
            inputTokensPerSecond: 100,
            outputTokensPerSecond: 50,
            retryCount: 1,
            success: true,
            errorCode: "NONE",
            recordedAt: "2026-09-02T12:00:02.000Z"
        };

        await repository.create(record);

        const [sql, parameters] = database.execute.mock.calls[0];

        expect(sql).toContain(
            "INSERT INTO core.AIPerformanceRecords"
        );

        expect(parameters).toEqual(
            expect.arrayContaining([
                { name: "id", value: "performance-1" },
                {
                    name: "usageRecordId",
                    value: "usage-1"
                },
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
                    name: "latencyMs",
                    value: 1500
                },
                {
                    name: "timeToFirstTokenMs",
                    value: 300
                },
                {
                    name: "inputTokensPerSecond",
                    value: 100
                },
                {
                    name: "outputTokensPerSecond",
                    value: 50
                },
                {
                    name: "retryCount",
                    value: 1
                },
                {
                    name: "success",
                    value: true
                },
                {
                    name: "errorCode",
                    value: "NONE"
                },
                {
                    name: "recordedAt",
                    value: "2026-09-02T12:00:02.000Z"
                }
            ])
        );
    });

    test("creates a performance record with nullable fields as null", async () => {
        database.execute.mockResolvedValue(1);

        const record: AIPerformanceRecord = {
            id: "performance-2",
            usageRecordId: "usage-2",
            tenantId: "tenant-1",
            provider: "openai",
            model: "gpt-5",
            requestType: "chat",
            success: false,
            recordedAt: "2026-09-02T12:00:02.000Z"
        };

        await repository.create(record);

        const [, parameters] = database.execute.mock.calls[0];

        expect(parameters).toEqual(
            expect.arrayContaining([
                { name: "latencyMs", value: null },
                {
                    name: "timeToFirstTokenMs",
                    value: null
                },
                {
                    name: "inputTokensPerSecond",
                    value: null
                },
                {
                    name: "outputTokensPerSecond",
                    value: null
                },
                { name: "retryCount", value: null },
                { name: "errorCode", value: null }
            ])
        );
    });

    test("returns the latest performance record for a usage record", async () => {
        database.query.mockResolvedValue({
            rows: [
                {
                    id: "performance-2",
                    usage_record_id: "usage-1",
                    tenant_id: "tenant-1",
                    provider: "openai",
                    model: "gpt-5",
                    request_type: "chat",
                    latency_ms: 1000,
                    time_to_first_token_ms: 200,
                    input_tokens_per_second: 120,
                    output_tokens_per_second: 60,
                    retry_count: 0,
                    success: true,
                    error_code: null,
                    recorded_at: new Date(
                        "2026-09-02T12:00:03.000Z"
                    )
                }
            ],
            rowCount: 1
        });

        const result = await repository.getByUsageRecord(
            "tenant-1",
            "usage-1"
        );

        expect(result).toEqual({
            id: "performance-2",
            usageRecordId: "usage-1",
            tenantId: "tenant-1",
            provider: "openai",
            model: "gpt-5",
            requestType: "chat",
            latencyMs: 1000,
            timeToFirstTokenMs: 200,
            inputTokensPerSecond: 120,
            outputTokensPerSecond: 60,
            retryCount: 0,
            success: true,
            recordedAt: "2026-09-02T12:00:03.000Z"
        });

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "tenant_id = @tenantId"
        );
        expect(sql).toContain(
            "usage_record_id = @usageRecordId"
        );
        expect(sql).toContain(
            "ORDER BY recorded_at DESC, id DESC"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "usageRecordId",
                value: "usage-1"
            }
        ]);
    });

    test("maps nullable performance fields correctly", async () => {
        database.query.mockResolvedValue({
            rows: [
                {
                    id: "performance-3",
                    usage_record_id: "usage-3",
                    tenant_id: "tenant-1",
                    provider: "openai",
                    model: "gpt-5",
                    request_type: "completion",
                    latency_ms: null,
                    time_to_first_token_ms: null,
                    input_tokens_per_second: null,
                    output_tokens_per_second: null,
                    retry_count: null,
                    success: false,
                    error_code: "PROVIDER_ERROR",
                    recorded_at: "2026-09-02T12:00:03.000Z"
                }
            ],
            rowCount: 1
        });

        const result = await repository.getByUsageRecord(
            "tenant-1",
            "usage-3"
        );

        expect(result).toEqual({
            id: "performance-3",
            usageRecordId: "usage-3",
            tenantId: "tenant-1",
            provider: "openai",
            model: "gpt-5",
            requestType: "completion",
            success: false,
            errorCode: "PROVIDER_ERROR",
            recordedAt: "2026-09-02T12:00:03.000Z"
        });
    });

    test("returns null when no performance record exists", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await expect(
            repository.getByUsageRecord(
                "tenant-1",
                "usage-1"
            )
        ).resolves.toBeNull();
    });

    test("enforces tenant isolation for usage-record lookups", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await repository.getByUsageRecord(
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
                name: "usageRecordId",
                value: "usage-1"
            }
        ]);
    });

    test("lists performance records for a tenant", async () => {
        database.query.mockResolvedValue({
            rows: [
                {
                    id: "performance-4",
                    usage_record_id: "usage-4",
                    tenant_id: "tenant-1",
                    provider: "openai",
                    model: "gpt-5",
                    request_type: "chat",
                    latency_ms: 800,
                    time_to_first_token_ms: 150,
                    input_tokens_per_second: 200,
                    output_tokens_per_second: 100,
                    retry_count: 0,
                    success: true,
                    error_code: null,
                    recorded_at: new Date(
                        "2026-09-02T12:00:03.000Z"
                    )
                }
            ],
            rowCount: 1
        });

        const result = await repository.listByTenant(
            "tenant-1"
        );

        expect(result).toEqual([
            {
                id: "performance-4",
                usageRecordId: "usage-4",
                tenantId: "tenant-1",
                provider: "openai",
                model: "gpt-5",
                requestType: "chat",
                latencyMs: 800,
                timeToFirstTokenMs: 150,
                inputTokensPerSecond: 200,
                outputTokensPerSecond: 100,
                retryCount: 0,
                success: true,
                recordedAt: "2026-09-02T12:00:03.000Z"
            }
        ]);

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "tenant_id = @tenantId"
        );
        expect(sql).toContain(
            "ORDER BY recorded_at DESC, id DESC"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            }
        ]);
    });

    test("applies both period filters when listing performance records", async () => {
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
            "recorded_at >= @periodStart"
        );
        expect(sql).toContain(
            "recorded_at <= @periodEnd"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "periodStart",
                value: "2026-09-01T00:00:00.000Z"
            },
            {
                name: "periodEnd",
                value: "2026-09-02T23:59:59.999Z"
            }
        ]);
    });

    test("applies only the period start filter", async () => {
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
            "recorded_at >= @periodStart"
        );
        expect(sql).not.toContain(
            "recorded_at <= @periodEnd"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "periodStart",
                value: "2026-09-01T00:00:00.000Z"
            }
        ]);
    });

    test("applies only the period end filter", async () => {
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

        expect(sql).not.toContain(
            "recorded_at >= @periodStart"
        );
        expect(sql).toContain(
            "recorded_at <= @periodEnd"
        );

        expect(parameters).toEqual([
            {
                name: "tenantId",
                value: "tenant-1"
            },
            {
                name: "periodEnd",
                value: "2026-09-02T23:59:59.999Z"
            }
        ]);
    });
});

