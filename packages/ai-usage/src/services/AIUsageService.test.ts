import {
jest,
describe,
beforeEach,
expect,
test
} from "@jest/globals";

import { AIUsageService } from "../services/AIUsageService.js";

import type {
AIUsageRecord,
AIPerformanceRecord,
AIProvider,
AIRequestType
} from "@intrusionshield/contracts";

import type {
IAIUsageRepository,
IAIPerformanceRepository,
IAIRequestLogRepository
} from "@intrusionshield/repositories";

describe("AIUsageService", () => {
let service: AIUsageService;


let usageRepository: jest.Mocked<IAIUsageRepository>;
let performanceRepository: jest.Mocked<IAIPerformanceRepository>;
let requestLogRepository: jest.Mocked<IAIRequestLogRepository>;

const tenantId = "tenant-1";
const userId = "user-1";
const applicationId = "application-1";

const provider = "openai" as AIProvider;
const requestType = "completion" as AIRequestType;

const createRepositoryMocks = () => {
    usageRepository = {
        create: jest.fn(),
        update: jest.fn(),
        getById: jest.fn(),
        listByTenant: jest.fn()
    };

    performanceRepository = {
        create: jest.fn(),
        getByUsageRecord: jest.fn(),
        listByTenant: jest.fn()
    };

    requestLogRepository = {
        create: jest.fn(),
        listByUsageRecord: jest.fn()
    };

    service = new AIUsageService(
        usageRepository,
        performanceRepository,
        requestLogRepository
    );
};

beforeEach(() => {
    jest.clearAllMocks();
    createRepositoryMocks();
});

describe("createRequest", () => {
    test("creates a pending usage record and logs the event", async () => {
        const result = await service.createRequest({
            tenantId,
            userId,
            applicationId,
            provider,
            model: "gpt-5",
            requestType,
            correlationId: "corr-1"
        });

        expect(result.id).toEqual(expect.any(String));
        expect(result.tenantId).toBe(tenantId);
        expect(result.userId).toBe(userId);
        expect(result.applicationId).toBe(applicationId);
        expect(result.provider).toBe(provider);
        expect(result.model).toBe("gpt-5");
        expect(result.requestType).toBe(requestType);
        expect(result.status).toBe("pending");
        expect(result.source).toBe("disruptor");
        expect(result.createdAt).toEqual(expect.any(String));
        expect(result.startedAt).toEqual(expect.any(String));

        expect(usageRepository.create).toHaveBeenCalledTimes(1);
        expect(usageRepository.create).toHaveBeenCalledWith(result);

        expect(requestLogRepository.create).toHaveBeenCalledTimes(1);
        expect(requestLogRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                usageRecordId: result.id,
                tenantId,
                userId,
                applicationId,
                correlationId: "corr-1",
                event: "request-created"
            })
        );
    });

    test("preserves explicitly supplied timestamps and source", async () => {
        const startedAt = "2026-09-01T10:00:00.000Z";

        const result = await service.createRequest({
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            startedAt,
            source: "test"
        });

        expect(result.startedAt).toBe(startedAt);
        expect(result.source).toBe("test");
    });
});

describe("completeRequest", () => {
    test("updates the request to success and calculates latency and total tokens", async () => {
        const existing: AIUsageRecord = {
            id: "usage-1",
            tenantId,
            userId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.completeRequest(
            tenantId,
            existing.id,
            {
                completedAt: "2026-09-01T10:00:01.500Z",
                inputTokens: 100,
                outputTokens: 50,
                estimatedCost: 0.0125,
                currency: "USD",
                providerRequestId: "provider-request-1"
            }
        );

        expect(result.status).toBe("success");
        expect(result.completedAt).toBe(
            "2026-09-01T10:00:01.500Z"
        );
        expect(result.latencyMs).toBe(1500);
        expect(result.inputTokens).toBe(100);
        expect(result.outputTokens).toBe(50);
        expect(result.totalTokens).toBe(150);
        expect(result.estimatedCost).toBe(0.0125);
        expect(result.currency).toBe("USD");
        expect(result.providerRequestId).toBe(
            "provider-request-1"
        );

        expect(usageRepository.update).toHaveBeenCalledWith(result);

        expect(requestLogRepository.create).toHaveBeenCalledTimes(2);

        expect(requestLogRepository.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                usageRecordId: existing.id,
                event: "response-received"
            })
        );

        expect(requestLogRepository.create).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                usageRecordId: existing.id,
                event: "request-completed"
            })
        );
    });

    test("uses explicitly supplied latency and total tokens", async () => {
        const existing: AIUsageRecord = {
            id: "usage-2",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.completeRequest(
            tenantId,
            existing.id,
            {
                completedAt: "2026-09-01T10:00:01.000Z",
                latencyMs: 42,
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 999
            }
        );

        expect(result.latencyMs).toBe(42);
        expect(result.totalTokens).toBe(999);
    });

    test("leaves total tokens undefined when token counts are absent", async () => {
        const existing: AIUsageRecord = {
            id: "usage-3",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.completeRequest(
            tenantId,
            existing.id,
            {}
        );

        expect(result.totalTokens).toBeUndefined();
    });

    test("preserves existing telemetry when completion omits optional values", async () => {
        const existing: AIUsageRecord = {
            id: "usage-preserve",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z",
            inputTokens: 120,
            outputTokens: 80,
            totalTokens: 200,
            estimatedCost: 0.025,
            currency: "USD",
            providerRequestId: "provider-existing"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.completeRequest(
            tenantId,
            existing.id,
            {
                completedAt: "2026-09-01T10:00:02.000Z"
            }
        );

        expect(result.status).toBe("success");
        expect(result.inputTokens).toBe(120);
        expect(result.outputTokens).toBe(80);
        expect(result.totalTokens).toBe(200);
        expect(result.estimatedCost).toBe(0.025);
        expect(result.currency).toBe("USD");
        expect(result.providerRequestId).toBe(
            "provider-existing"
        );

        expect(usageRepository.update).toHaveBeenCalledWith(result);
    });
});

describe("failRequest", () => {
    test("marks the request as an error", async () => {
        const existing: AIUsageRecord = {
            id: "usage-error",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.failRequest(
            tenantId,
            existing.id,
            {
                errorCode: "PROVIDER_TIMEOUT",
                completedAt: "2026-09-01T10:00:03.000Z",
                providerRequestId: "provider-123"
            }
        );

        expect(result.status).toBe("error");
        expect(result.errorCode).toBe("PROVIDER_TIMEOUT");
        expect(result.latencyMs).toBe(3000);
        expect(result.providerRequestId).toBe("provider-123");

        expect(usageRepository.update).toHaveBeenCalledWith(result);

        expect(requestLogRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                usageRecordId: existing.id,
                tenantId,
                event: "request-failed"
            })
        );
    });

    test("preserves existing error details when failure omits optional values", async () => {
        const existing: AIUsageRecord = {
            id: "usage-error-preserve",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z",
            errorCode: "PROVIDER_TIMEOUT",
            providerRequestId: "provider-existing"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.failRequest(
            tenantId,
            existing.id,
            {
                completedAt: "2026-09-01T10:00:03.000Z"
            }
        );

        expect(result.status).toBe("error");
        expect(result.errorCode).toBe("PROVIDER_TIMEOUT");
        expect(result.providerRequestId).toBe(
            "provider-existing"
        );
    });
});

describe("blockRequest", () => {
    test("marks the request as blocked", async () => {
        const existing: AIUsageRecord = {
            id: "usage-blocked",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.blockRequest(
            tenantId,
            existing.id,
            "AI_POLICY_BLOCK"
        );

        expect(result.status).toBe("blocked");
        expect(result.errorCode).toBe("AI_POLICY_BLOCK");

        expect(usageRepository.update).toHaveBeenCalledWith(result);

        expect(requestLogRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                usageRecordId: existing.id,
                event: "request-blocked"
            })
        );
    });

    test("preserves an existing error code when no new code is supplied", async () => {
        const existing: AIUsageRecord = {
            id: "usage-blocked-existing-error",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z",
            errorCode: "EXISTING_POLICY_ERROR"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.blockRequest(
            tenantId,
            existing.id
        );

        expect(result.status).toBe("blocked");
        expect(result.errorCode).toBe(
            "EXISTING_POLICY_ERROR"
        );
    });
});

describe("rateLimitRequest", () => {
    test("marks the request as rate-limited", async () => {
        const existing: AIUsageRecord = {
            id: "usage-rate-limit",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.rateLimitRequest(
            tenantId,
            existing.id,
            "RATE_LIMIT_EXCEEDED"
        );

        expect(result.status).toBe("rate-limited");
        expect(result.errorCode).toBe("RATE_LIMIT_EXCEEDED");

        expect(usageRepository.update).toHaveBeenCalledWith(result);

        expect(requestLogRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                usageRecordId: existing.id,
                event: "request-rate-limited"
            })
        );
    });

    test("preserves an existing error code when no new code is supplied", async () => {
        const existing: AIUsageRecord = {
            id: "usage-rate-limit-existing-error",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z",
            errorCode: "EXISTING_RATE_LIMIT_ERROR"
        };

        usageRepository.getById.mockResolvedValue(existing);

        const result = await service.rateLimitRequest(
            tenantId,
            existing.id
        );

        expect(result.status).toBe("rate-limited");
        expect(result.errorCode).toBe(
            "EXISTING_RATE_LIMIT_ERROR"
        );
    });
});

describe("recordPerformance", () => {
    test("creates an AI performance record", async () => {
        const result = await service.recordPerformance({
            usageRecordId: "usage-performance",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            latencyMs: 850,
            timeToFirstTokenMs: 120,
            inputTokensPerSecond: 500,
            outputTokensPerSecond: 75,
            retryCount: 1,
            success: true
        });

        expect(result.id).toEqual(expect.any(String));
        expect(result.usageRecordId).toBe("usage-performance");
        expect(result.tenantId).toBe(tenantId);
        expect(result.latencyMs).toBe(850);
        expect(result.timeToFirstTokenMs).toBe(120);
        expect(result.retryCount).toBe(1);
        expect(result.success).toBe(true);
        expect(result.recordedAt).toEqual(expect.any(String));

        expect(performanceRepository.create).toHaveBeenCalledTimes(1);
        expect(performanceRepository.create).toHaveBeenCalledWith(result);
    });
});

describe("getRequest", () => {
    test("returns the request for the specified tenant", async () => {
        const record: AIUsageRecord = {
            id: "usage-get",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(record);

        await expect(
            service.getRequest(tenantId, record.id)
        ).resolves.toBe(record);

        expect(usageRepository.getById).toHaveBeenCalledWith(
            tenantId,
            record.id
        );
    });

    test("returns null when the repository has no matching record", async () => {
        usageRepository.getById.mockResolvedValue(null);

        await expect(
            service.getRequest(tenantId, "missing")
        ).resolves.toBeNull();
    });
});

describe("record lookup and validation", () => {
    test("throws when completing a nonexistent request", async () => {
        usageRepository.getById.mockResolvedValue(null);

        await expect(
            service.completeRequest(
                tenantId,
                "missing",
                {}
            )
        ).rejects.toThrow(
            "AI usage record not found."
        );

        expect(usageRepository.update).not.toHaveBeenCalled();
        expect(requestLogRepository.create).not.toHaveBeenCalled();
    });

    test("throws when failing a nonexistent request", async () => {
        usageRepository.getById.mockResolvedValue(null);

        await expect(
            service.failRequest(
                tenantId,
                "missing"
            )
        ).rejects.toThrow(
            "AI usage record not found."
        );
    });

    test("throws when completion time precedes start time", async () => {
        const existing: AIUsageRecord = {
            id: "usage-time",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:10.000Z",
            createdAt: "2026-09-01T10:00:10.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        await expect(
            service.completeRequest(
                tenantId,
                existing.id,
                {
                    completedAt:
                        "2026-09-01T10:00:05.000Z"
                }
            )
        ).rejects.toThrow(
            "AI request completion time cannot precede its start time."
        );

        expect(usageRepository.update).not.toHaveBeenCalled();
    });
});

describe("tenant isolation", () => {
    test("always passes the tenant ID to repository lookups", async () => {
        usageRepository.getById.mockResolvedValue(null);

        await service.getRequest(
            "tenant-a",
            "usage-1"
        );

        expect(usageRepository.getById).toHaveBeenCalledWith(
            "tenant-a",
            "usage-1"
        );

        expect(usageRepository.getById).not.toHaveBeenCalledWith(
            "tenant-b",
            "usage-1"
        );
    });
});

describe("request identity", () => {
    test("does not allow an existing record identity to be changed", async () => {
        const existing: AIUsageRecord = {
            id: "original-id",
            tenantId,
            provider,
            model: "gpt-5",
            requestType,
            status: "pending",
            startedAt: "2026-09-01T10:00:00.000Z",
            createdAt: "2026-09-01T10:00:00.000Z"
        };

        usageRepository.getById.mockResolvedValue(existing);

        /*
         * The service always spreads the existing record, so the
         * identity remains immutable during normal transitions.
         * This test verifies that update receives the original ID.
         */
        const result = await service.blockRequest(
            tenantId,
            existing.id,
            "TEST_BLOCK"
        );

        expect(result.id).toBe(existing.id);
        expect(usageRepository.update).toHaveBeenCalledWith(
            expect.objectContaining({
                id: existing.id
            })
        );
    });
});


});
