import { randomUUID } from "node:crypto";

import type {
    AIProvider,
    AIRequestType,
    AIUsageRecord,
    AIPerformanceRecord
} from "@intrusionshield/contracts";

import type {
    IAIUsageRepository,
    IAIPerformanceRepository,
    IAIRequestLogRepository
} from "@intrusionshield/repositories";

export interface CreateAIUsageRequest {
    readonly tenantId: string;
    readonly userId?: string;
    readonly applicationId?: string;
    readonly provider: AIProvider;
    readonly model: string;
    readonly requestType: AIRequestType;
    readonly correlationId?: string;
    readonly startedAt?: string;
    readonly source?: string;
}

export interface CompleteAIUsageRequest {
    readonly completedAt?: string;
    readonly latencyMs?: number;
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
    readonly estimatedCost?: number;
    readonly currency?: string;
    readonly providerRequestId?: string;
}

export interface FailAIUsageRequest {
    readonly errorCode?: string;
    readonly completedAt?: string;
    readonly latencyMs?: number;
    readonly providerRequestId?: string;
}

export interface RecordAIPerformanceRequest {
    readonly usageRecordId: string;
    readonly tenantId: string;
    readonly provider: AIProvider;
    readonly model: string;
    readonly requestType: AIRequestType;
    readonly latencyMs?: number;
    readonly timeToFirstTokenMs?: number;
    readonly inputTokensPerSecond?: number;
    readonly outputTokensPerSecond?: number;
    readonly retryCount?: number;
    readonly success: boolean;
    readonly errorCode?: string;
    readonly recordedAt?: string;
}

export class AIUsageService {
    public constructor(
        private readonly usageRepository: IAIUsageRepository,
        private readonly performanceRepository: IAIPerformanceRepository,
        private readonly requestLogRepository: IAIRequestLogRepository
    ) {}

    public async createRequest(
        request: CreateAIUsageRequest
    ): Promise<AIUsageRecord> {
        const now = this.now();

        const record: AIUsageRecord = {
            id: randomUUID(),
            tenantId: request.tenantId,
            userId: request.userId,
            applicationId: request.applicationId,
            provider: request.provider,
            model: request.model,
            requestType: request.requestType,
            status: "pending",
            correlationId: request.correlationId,
            startedAt: request.startedAt ?? now,
            source: request.source ?? "disruptor",
            createdAt: now
        };

        await this.usageRepository.create(record);

        await this.logEvent(
            record,
            "request-created"
        );

        return record;
    }

    public async completeRequest(
        tenantId: string,
        usageRecordId: string,
        request: CompleteAIUsageRequest
    ): Promise<AIUsageRecord> {
        const existing =
            await this.getRequiredRecord(
                tenantId,
                usageRecordId
            );

        const completedAt =
            request.completedAt ?? this.now();

        const latencyMs =
            request.latencyMs ??
            this.calculateLatency(
                existing.startedAt,
                completedAt
            );

        const inputTokens =
            request.inputTokens ??
            existing.inputTokens;

        const outputTokens =
            request.outputTokens ??
            existing.outputTokens;

        const totalTokens =
            request.totalTokens ??
            this.calculateTotalTokens(
                inputTokens,
                outputTokens
            );

        const updated: AIUsageRecord = {
            ...existing,
            status: "success",
            completedAt,
            latencyMs,
            inputTokens,
            outputTokens,
            totalTokens,
            estimatedCost:
                request.estimatedCost ??
                existing.estimatedCost,
            currency:
                request.currency ??
                existing.currency,
            providerRequestId:
                request.providerRequestId ??
                existing.providerRequestId
        };

        await this.persistUpdate(
            existing,
            updated
        );

        await this.logEvent(
            updated,
            "response-received"
        );

        await this.logEvent(
            updated,
            "request-completed"
        );

        return updated;
    }

    public async failRequest(
        tenantId: string,
        usageRecordId: string,
        request: FailAIUsageRequest = {}
    ): Promise<AIUsageRecord> {
        const existing =
            await this.getRequiredRecord(
                tenantId,
                usageRecordId
            );

        const completedAt =
            request.completedAt ?? this.now();

        const latencyMs =
            request.latencyMs ??
            this.calculateLatency(
                existing.startedAt,
                completedAt
            );

        const updated: AIUsageRecord = {
            ...existing,
            status: "error",
            completedAt,
            latencyMs,
            errorCode:
                request.errorCode ??
                existing.errorCode,
            providerRequestId:
                request.providerRequestId ??
                existing.providerRequestId
        };

        await this.persistUpdate(
            existing,
            updated
        );

        await this.logEvent(
            updated,
            "request-failed"
        );

        return updated;
    }

    public async blockRequest(
        tenantId: string,
        usageRecordId: string,
        errorCode?: string
    ): Promise<AIUsageRecord> {
        return this.transitionRequest(
            tenantId,
            usageRecordId,
            "blocked",
            "request-blocked",
            errorCode
        );
    }

    public async rateLimitRequest(
        tenantId: string,
        usageRecordId: string,
        errorCode?: string
    ): Promise<AIUsageRecord> {
        return this.transitionRequest(
            tenantId,
            usageRecordId,
            "rate-limited",
            "request-rate-limited",
            errorCode
        );
    }

    public async recordPerformance(
        request: RecordAIPerformanceRequest
    ): Promise<AIPerformanceRecord> {
        const performance: AIPerformanceRecord = {
            id: randomUUID(),
            usageRecordId: request.usageRecordId,
            tenantId: request.tenantId,
            provider: request.provider,
            model: request.model,
            requestType: request.requestType,
            latencyMs: request.latencyMs,
            timeToFirstTokenMs:
                request.timeToFirstTokenMs,
            inputTokensPerSecond:
                request.inputTokensPerSecond,
            outputTokensPerSecond:
                request.outputTokensPerSecond,
            retryCount: request.retryCount,
            success: request.success,
            errorCode: request.errorCode,
            recordedAt:
                request.recordedAt ?? this.now()
        };

        await this.performanceRepository.create(
            performance
        );

        return performance;
    }

    public async getRequest(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIUsageRecord | null> {
        return this.usageRepository.getById(
            tenantId,
            usageRecordId
        );
    }

    private async transitionRequest(
        tenantId: string,
        usageRecordId: string,
        status: AIUsageRecord["status"],
        event:
            | "request-blocked"
            | "request-rate-limited",
        errorCode?: string
    ): Promise<AIUsageRecord> {
        const existing =
            await this.getRequiredRecord(
                tenantId,
                usageRecordId
            );

        const updated: AIUsageRecord = {
            ...existing,
            status,
            completedAt: this.now(),
            errorCode:
                errorCode ??
                existing.errorCode
        };

        await this.persistUpdate(
            existing,
            updated
        );

        await this.logEvent(
            updated,
            event
        );

        return updated;
    }

    private async persistUpdate(
        existing: AIUsageRecord,
        updated: AIUsageRecord
    ): Promise<void> {
        if (existing.id !== updated.id) {
            throw new Error(
                "AI usage record identity cannot change."
            );
        }

        await this.usageRepository.update(
            updated
        );
    }

    private async getRequiredRecord(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIUsageRecord> {
        const record =
            await this.usageRepository.getById(
                tenantId,
                usageRecordId
            );

        if (!record) {
            throw new Error(
                "AI usage record not found."
            );
        }

        return record;
    }

    private async logEvent(
        record: AIUsageRecord,
        event:
            | "request-created"
            | "response-received"
            | "request-completed"
            | "request-failed"
            | "request-blocked"
            | "request-rate-limited"
    ): Promise<void> {
        await this.requestLogRepository.create({
            id: randomUUID(),
            usageRecordId: record.id,
            tenantId: record.tenantId,
            userId: record.userId,
            applicationId: record.applicationId,
            correlationId: record.correlationId,
            event,
            timestamp: this.now()
        });
    }

    private calculateLatency(
        startedAt: string,
        completedAt: string
    ): number {
        const started =
            new Date(startedAt).getTime();

        const completed =
            new Date(completedAt).getTime();

        const latency =
            completed - started;

        if (
            !Number.isFinite(latency) ||
            latency < 0
        ) {
            throw new Error(
                "AI request completion time cannot precede its start time."
            );
        }

        return latency;
    }

    private calculateTotalTokens(
        inputTokens?: number,
        outputTokens?: number
    ): number | undefined {
        if (
            inputTokens === undefined &&
            outputTokens === undefined
        ) {
            return undefined;
        }

        return (
            (inputTokens ?? 0) +
            (outputTokens ?? 0)
        );
    }

    private now(): string {
        return new Date().toISOString();
    }
}