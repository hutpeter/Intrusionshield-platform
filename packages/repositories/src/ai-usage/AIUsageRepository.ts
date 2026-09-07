import type { DatabaseManager } from "@intrusionshield/database";
import type { AIUsageRecord } from "@intrusionshield/contracts";
import type { IAIUsageRepository } from "./IAIUsageRepository.js";

interface AIUsageRecordRow {
    id: string;
    tenant_id: string;
    user_id: string | null;
    application_id: string | null;
    provider: AIUsageRecord["provider"];
    model: string;
    request_type: AIUsageRecord["requestType"];
    status: AIUsageRecord["status"];
    correlation_id: string | null;
    started_at: Date | string;
    completed_at: Date | string | null;
    latency_ms: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    estimated_cost: number | string | null;
    currency: string | null;
    error_code: string | null;
    provider_request_id: string | null;
    source: string;
    created_at: Date | string;
}

function toISOString(value: Date | string): string {
    return value instanceof Date
        ? value.toISOString()
        : value;
}

function mapRow(row: AIUsageRecordRow): AIUsageRecord {
    return {
        id: row.id,
        tenantId: row.tenant_id,
        ...(row.user_id !== null && {
            userId: row.user_id
        }),
        ...(row.application_id !== null && {
            applicationId: row.application_id
        }),
        provider: row.provider,
        model: row.model,
        requestType: row.request_type,
        status: row.status,
        ...(row.correlation_id !== null && {
            correlationId: row.correlation_id
        }),
        startedAt: toISOString(row.started_at),
        ...(row.completed_at !== null && {
            completedAt: toISOString(row.completed_at)
        }),
        ...(row.latency_ms !== null && {
            latencyMs: row.latency_ms
        }),
        ...(row.input_tokens !== null && {
            inputTokens: row.input_tokens
        }),
        ...(row.output_tokens !== null && {
            outputTokens: row.output_tokens
        }),
        ...(row.total_tokens !== null && {
            totalTokens: row.total_tokens
        }),
        ...(row.estimated_cost !== null && {
            estimatedCost: Number(row.estimated_cost)
        }),
        ...(row.currency !== null && {
            currency: row.currency
        }),
        ...(row.error_code !== null && {
            errorCode: row.error_code
        }),
        ...(row.provider_request_id !== null && {
            providerRequestId: row.provider_request_id
        }),
        source: row.source,
        createdAt: toISOString(row.created_at)
    };
}

export class AIUsageRepository implements IAIUsageRepository {
    public constructor(
        private readonly database: DatabaseManager
    ) {}

    public async create(
        record: AIUsageRecord
    ): Promise<void> {
        await this.database.execute(
            `
                INSERT INTO core.AIUsageRecords (
                    id,
                    tenant_id,
                    user_id,
                    application_id,
                    provider,
                    model,
                    request_type,
                    status,
                    correlation_id,
                    started_at,
                    completed_at,
                    latency_ms,
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    estimated_cost,
                    currency,
                    error_code,
                    provider_request_id,
                    source,
                    created_at
                )
                VALUES (
                    @id,
                    @tenantId,
                    @userId,
                    @applicationId,
                    @provider,
                    @model,
                    @requestType,
                    @status,
                    @correlationId,
                    @startedAt,
                    @completedAt,
                    @latencyMs,
                    @inputTokens,
                    @outputTokens,
                    @totalTokens,
                    @estimatedCost,
                    @currency,
                    @errorCode,
                    @providerRequestId,
                    @source,
                    @createdAt
                )
            `,
            [
                { name: "id", value: record.id },
                { name: "tenantId", value: record.tenantId },
                { name: "userId", value: record.userId ?? null },
                {
                    name: "applicationId",
                    value: record.applicationId ?? null
                },
                { name: "provider", value: record.provider },
                { name: "model", value: record.model },
                {
                    name: "requestType",
                    value: record.requestType
                },
                { name: "status", value: record.status },
                {
                    name: "correlationId",
                    value: record.correlationId ?? null
                },
                { name: "startedAt", value: record.startedAt },
                {
                    name: "completedAt",
                    value: record.completedAt ?? null
                },
                {
                    name: "latencyMs",
                    value: record.latencyMs ?? null
                },
                {
                    name: "inputTokens",
                    value: record.inputTokens ?? null
                },
                {
                    name: "outputTokens",
                    value: record.outputTokens ?? null
                },
                {
                    name: "totalTokens",
                    value: record.totalTokens ?? null
                },
                {
                    name: "estimatedCost",
                    value: record.estimatedCost ?? null
                },
                {
                    name: "currency",
                    value: record.currency ?? null
                },
                {
                    name: "errorCode",
                    value: record.errorCode ?? null
                },
                {
                    name: "providerRequestId",
                    value: record.providerRequestId ?? null
                },
                { name: "source", value: record.source },
                { name: "createdAt", value: record.createdAt }
            ]
        );
    }

    public async update(
        record: AIUsageRecord
    ): Promise<void> {
        await this.database.execute(
            `
                UPDATE core.AIUsageRecords
                SET
                    status = @status,
                    completed_at = @completedAt,
                    latency_ms = @latencyMs,
                    input_tokens = @inputTokens,
                    output_tokens = @outputTokens,
                    total_tokens = @totalTokens,
                    estimated_cost = @estimatedCost,
                    currency = @currency,
                    error_code = @errorCode,
                    provider_request_id = @providerRequestId
                WHERE tenant_id = @tenantId
                  AND id = @id
            `,
            [
                { name: "status", value: record.status },
                {
                    name: "completedAt",
                    value: record.completedAt ?? null
                },
                {
                    name: "latencyMs",
                    value: record.latencyMs ?? null
                },
                {
                    name: "inputTokens",
                    value: record.inputTokens ?? null
                },
                {
                    name: "outputTokens",
                    value: record.outputTokens ?? null
                },
                {
                    name: "totalTokens",
                    value: record.totalTokens ?? null
                },
                {
                    name: "estimatedCost",
                    value: record.estimatedCost ?? null
                },
                {
                    name: "currency",
                    value: record.currency ?? null
                },
                {
                    name: "errorCode",
                    value: record.errorCode ?? null
                },
                {
                    name: "providerRequestId",
                    value: record.providerRequestId ?? null
                },
                { name: "tenantId", value: record.tenantId },
                { name: "id", value: record.id }
            ]
        );
    }

    public async getById(
        tenantId: string,
        id: string
    ): Promise<AIUsageRecord | null> {
        const result = await this.database.query<AIUsageRecordRow>(
            `
                SELECT
                    id,
                    tenant_id,
                    user_id,
                    application_id,
                    provider,
                    model,
                    request_type,
                    status,
                    correlation_id,
                    started_at,
                    completed_at,
                    latency_ms,
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    estimated_cost,
                    currency,
                    error_code,
                    provider_request_id,
                    source,
                    created_at
                FROM core.AIUsageRecords
                WHERE tenant_id = @tenantId
                  AND id = @id
            `,
            [
                { name: "tenantId", value: tenantId },
                { name: "id", value: id }
            ]
        );

        const row = result.rows[0];

        return row === undefined
            ? null
            : mapRow(row);
    }

    public async listByTenant(
        tenantId: string,
        periodStart?: string,
        periodEnd?: string
    ): Promise<AIUsageRecord[]> {
        const parameters = [
            { name: "tenantId", value: tenantId }
        ];

        let periodClause = "";

        if (periodStart !== undefined) {
            periodClause +=
                " AND started_at >= @periodStart";
            parameters.push({
                name: "periodStart",
                value: periodStart
            });
        }

        if (periodEnd !== undefined) {
            periodClause +=
                " AND started_at <= @periodEnd";
            parameters.push({
                name: "periodEnd",
                value: periodEnd
            });
        }

        const result = await this.database.query<AIUsageRecordRow>(
            `
                SELECT
                    id,
                    tenant_id,
                    user_id,
                    application_id,
                    provider,
                    model,
                    request_type,
                    status,
                    correlation_id,
                    started_at,
                    completed_at,
                    latency_ms,
                    input_tokens,
                    output_tokens,
                    total_tokens,
                    estimated_cost,
                    currency,
                    error_code,
                    provider_request_id,
                    source,
                    created_at
                FROM core.AIUsageRecords
                WHERE tenant_id = @tenantId
                ${periodClause}
                ORDER BY started_at DESC, id DESC
            `,
            parameters
        );

        return result.rows.map(mapRow);
    }
}