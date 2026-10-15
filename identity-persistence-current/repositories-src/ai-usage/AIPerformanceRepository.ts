import type { DatabaseManager } from "@intrusionshield/database";
import type { AIPerformanceRecord } from "@intrusionshield/contracts";
import type { IAIPerformanceRepository } from "./IAIPerformanceRepository.js";

interface AIPerformanceRecordRow {
    id: string;
    usage_record_id: string;
    tenant_id: string;
    provider: AIPerformanceRecord["provider"];
    model: string;
    request_type: AIPerformanceRecord["requestType"];
    latency_ms: number | null;
    time_to_first_token_ms: number | null;
    input_tokens_per_second: number | null;
    output_tokens_per_second: number | null;
    retry_count: number | null;
    success: boolean;
    error_code: string | null;
    recorded_at: Date | string;
}

function toISOString(value: Date | string): string {
    return value instanceof Date
        ? value.toISOString()
        : value;
}

function mapRow(
    row: AIPerformanceRecordRow
): AIPerformanceRecord {
    return {
        id: row.id,
        usageRecordId: row.usage_record_id,
        tenantId: row.tenant_id,
        provider: row.provider,
        model: row.model,
        requestType: row.request_type,
        ...(row.latency_ms !== null && {
            latencyMs: row.latency_ms
        }),
        ...(row.time_to_first_token_ms !== null && {
            timeToFirstTokenMs: row.time_to_first_token_ms
        }),
        ...(row.input_tokens_per_second !== null && {
            inputTokensPerSecond:
                row.input_tokens_per_second
        }),
        ...(row.output_tokens_per_second !== null && {
            outputTokensPerSecond:
                row.output_tokens_per_second
        }),
        ...(row.retry_count !== null && {
            retryCount: row.retry_count
        }),
        success: row.success,
        ...(row.error_code !== null && {
            errorCode: row.error_code
        }),
        recordedAt: toISOString(row.recorded_at)
    };
}

export class AIPerformanceRepository
    implements IAIPerformanceRepository
{
    public constructor(
        private readonly database: DatabaseManager
    ) {}

    public async create(
        record: AIPerformanceRecord
    ): Promise<void> {
        await this.database.execute(
            `
                INSERT INTO core.AIPerformanceRecords (
                    id,
                    usage_record_id,
                    tenant_id,
                    provider,
                    model,
                    request_type,
                    latency_ms,
                    time_to_first_token_ms,
                    input_tokens_per_second,
                    output_tokens_per_second,
                    retry_count,
                    success,
                    error_code,
                    recorded_at
                )
                VALUES (
                    @id,
                    @usageRecordId,
                    @tenantId,
                    @provider,
                    @model,
                    @requestType,
                    @latencyMs,
                    @timeToFirstTokenMs,
                    @inputTokensPerSecond,
                    @outputTokensPerSecond,
                    @retryCount,
                    @success,
                    @errorCode,
                    @recordedAt
                )
            `,
            [
                { name: "id", value: record.id },
                {
                    name: "usageRecordId",
                    value: record.usageRecordId
                },
                { name: "tenantId", value: record.tenantId },
                { name: "provider", value: record.provider },
                { name: "model", value: record.model },
                {
                    name: "requestType",
                    value: record.requestType
                },
                {
                    name: "latencyMs",
                    value: record.latencyMs ?? null
                },
                {
                    name: "timeToFirstTokenMs",
                    value:
                        record.timeToFirstTokenMs ?? null
                },
                {
                    name: "inputTokensPerSecond",
                    value:
                        record.inputTokensPerSecond ?? null
                },
                {
                    name: "outputTokensPerSecond",
                    value:
                        record.outputTokensPerSecond ?? null
                },
                {
                    name: "retryCount",
                    value: record.retryCount ?? null
                },
                { name: "success", value: record.success },
                {
                    name: "errorCode",
                    value: record.errorCode ?? null
                },
                {
                    name: "recordedAt",
                    value: record.recordedAt
                }
            ]
        );
    }

    public async getByUsageRecord(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIPerformanceRecord | null> {
        const result =
            await this.database.query<AIPerformanceRecordRow>(
                `
                    SELECT
                        id,
                        usage_record_id,
                        tenant_id,
                        provider,
                        model,
                        request_type,
                        latency_ms,
                        time_to_first_token_ms,
                        input_tokens_per_second,
                        output_tokens_per_second,
                        retry_count,
                        success,
                        error_code,
                        recorded_at
                    FROM core.AIPerformanceRecords
                    WHERE tenant_id = @tenantId
                      AND usage_record_id = @usageRecordId
                    ORDER BY recorded_at DESC, id DESC
                `,
                [
                    { name: "tenantId", value: tenantId },
                    {
                        name: "usageRecordId",
                        value: usageRecordId
                    }
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
    ): Promise<AIPerformanceRecord[]> {
        const parameters = [
            { name: "tenantId", value: tenantId }
        ];

        let periodClause = "";

        if (periodStart !== undefined) {
            periodClause +=
                " AND recorded_at >= @periodStart";
            parameters.push({
                name: "periodStart",
                value: periodStart
            });
        }

        if (periodEnd !== undefined) {
            periodClause +=
                " AND recorded_at <= @periodEnd";
            parameters.push({
                name: "periodEnd",
                value: periodEnd
            });
        }

        const result =
            await this.database.query<AIPerformanceRecordRow>(
                `
                    SELECT
                        id,
                        usage_record_id,
                        tenant_id,
                        provider,
                        model,
                        request_type,
                        latency_ms,
                        time_to_first_token_ms,
                        input_tokens_per_second,
                        output_tokens_per_second,
                        retry_count,
                        success,
                        error_code,
                        recorded_at
                    FROM core.AIPerformanceRecords
                    WHERE tenant_id = @tenantId
                    ${periodClause}
                    ORDER BY recorded_at DESC, id DESC
                `,
                parameters
            );

        return result.rows.map(mapRow);
    }
}