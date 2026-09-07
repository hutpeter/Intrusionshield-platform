
import {
    jest,
    describe,
    beforeEach,
    expect,
    test
} from "@jest/globals";
import type { DatabaseManager } from "@intrusionshield/database";
import type { AIRequestLog } from "@intrusionshield/contracts";
import { AIRequestLogRepository } from "./AIRequestLogRepository.js";

describe("AIRequestLogRepository", () => {
    let database: {
        query: jest.Mock;
        execute: jest.Mock;
    };

    let repository: AIRequestLogRepository;

    beforeEach(() => {
        database = {
            query: jest.fn(),
            execute: jest.fn()
        };

        repository = new AIRequestLogRepository(
            database as unknown as DatabaseManager
        );
    });

    test("creates a request log and serializes metadata as JSON", async () => {
        database.execute.mockResolvedValue(1);

        const log: AIRequestLog = {
            id: "log-1",
            usageRecordId: "usage-1",
            tenantId: "tenant-1",
            userId: "user-1",
            applicationId: "app-1",
            correlationId: "corr-1",
            event: "request-created",
            timestamp: "2026-09-02T12:00:00.000Z",
            metadata: {
                route: "/api/ai/chat",
                requestNumber: 1,
                governed: true
            }
        };

        await repository.create(log);

        const [sql, parameters] =
            database.execute.mock.calls[0];

        expect(sql).toContain(
            "INSERT INTO core.AIRequestLogs"
        );

        expect(parameters).toEqual(
            expect.arrayContaining([
                {
                    name: "id",
                    value: "log-1"
                },
                {
                    name: "usageRecordId",
                    value: "usage-1"
                },
                {
                    name: "tenantId",
                    value: "tenant-1"
                },
                {
                    name: "userId",
                    value: "user-1"
                },
                {
                    name: "applicationId",
                    value: "app-1"
                },
                {
                    name: "correlationId",
                    value: "corr-1"
                },
                {
                    name: "event",
                    value: "request-created"
                },
                {
                    name: "timestamp",
                    value: "2026-09-02T12:00:00.000Z"
                },
                {
                    name: "metadataJson",
                    value: JSON.stringify({
                        route: "/api/ai/chat",
                        requestNumber: 1,
                        governed: true
                    })
                }
            ])
        );
    });

    test("stores null optional fields when they are omitted", async () => {
        database.execute.mockResolvedValue(1);

        const log: AIRequestLog = {
            id: "log-2",
            usageRecordId: "usage-2",
            tenantId: "tenant-1",
            event: "request-completed",
            timestamp: "2026-09-02T12:00:00.000Z"
        };

        await repository.create(log);

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
                    name: "metadataJson",
                    value: null
                }
            ])
        );
    });

    test("lists request logs and deserializes metadata", async () => {
        database.query.mockResolvedValue({
            rows: [
                {
                    id: "log-1",
                    usage_record_id: "usage-1",
                    tenant_id: "tenant-1",
                    user_id: "user-1",
                    application_id: "app-1",
                    correlation_id: "corr-1",
                    event: "response-received",
                    timestamp: new Date(
                        "2026-09-02T12:00:01.000Z"
                    ),
                    metadata_json: JSON.stringify({
                        statusCode: 200,
                        cached: false
                    })
                }
            ],
            rowCount: 1
        });

        const result =
            await repository.listByUsageRecord(
                "tenant-1",
                "usage-1"
            );

        expect(result).toEqual([
            {
                id: "log-1",
                usageRecordId: "usage-1",
                tenantId: "tenant-1",
                userId: "user-1",
                applicationId: "app-1",
                correlationId: "corr-1",
                event: "response-received",
                timestamp: "2026-09-02T12:00:01.000Z",
                metadata: {
                    statusCode: 200,
                    cached: false
                }
            }
        ]);

        const [sql, parameters] =
            database.query.mock.calls[0];

        expect(sql).toContain(
            "tenant_id = @tenantId"
        );
        expect(sql).toContain(
            "usage_record_id = @usageRecordId"
        );
        expect(sql).toContain(
            "ORDER BY timestamp ASC, id ASC"
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

    test("maps nullable database fields correctly", async () => {
        database.query.mockResolvedValue({
            rows: [
                {
                    id: "log-2",
                    usage_record_id: "usage-2",
                    tenant_id: "tenant-1",
                    user_id: null,
                    application_id: null,
                    correlation_id: null,
                    event: "request-completed",
                    timestamp: "2026-09-02T12:00:01.000Z",
                    metadata_json: null
                }
            ],
            rowCount: 1
        });

        const result =
            await repository.listByUsageRecord(
                "tenant-1",
                "usage-2"
            );

        expect(result).toEqual([
            {
                id: "log-2",
                usageRecordId: "usage-2",
                tenantId: "tenant-1",
                event: "request-completed",
                timestamp: "2026-09-02T12:00:01.000Z"
            }
        ]);
    });

    test("returns an empty list when no request logs exist", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await expect(
            repository.listByUsageRecord(
                "tenant-1",
                "usage-1"
            )
        ).resolves.toEqual([]);
    });

    test("enforces tenant isolation for request logs", async () => {
        database.query.mockResolvedValue({
            rows: [],
            rowCount: 0
        });

        await repository.listByUsageRecord(
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
});

