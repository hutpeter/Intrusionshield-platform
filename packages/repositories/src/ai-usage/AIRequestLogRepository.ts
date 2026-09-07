import type { DatabaseManager } from "@intrusionshield/database";
import type { AIRequestLog } from "@intrusionshield/contracts";
import type { IAIRequestLogRepository } from "./IAIRequestLogRepository.js";

interface AIRequestLogRow {
    id: string;
    usage_record_id: string;
    tenant_id: string;
    user_id: string | null;
    application_id: string | null;
    correlation_id: string | null;
    event: AIRequestLog["event"];
    timestamp: Date | string;
    metadata_json: string | null;
}

function toISOString(value: Date | string): string {
    return value instanceof Date
        ? value.toISOString()
        : value;
}

function mapRow(row: AIRequestLogRow): AIRequestLog {
    let metadata: Record<string, unknown> | undefined;

    if (row.metadata_json !== null) {
        metadata = JSON.parse(row.metadata_json) as Record<
            string,
            unknown
        >;
    }

    return {
        id: row.id,
        usageRecordId: row.usage_record_id,
        tenantId: row.tenant_id,
        ...(row.user_id !== null && {
            userId: row.user_id
        }),
        ...(row.application_id !== null && {
            applicationId: row.application_id
        }),
        ...(row.correlation_id !== null && {
            correlationId: row.correlation_id
        }),
        event: row.event,
        timestamp: toISOString(row.timestamp),
        ...(metadata !== undefined && {
            metadata
        })
    };
}

export class AIRequestLogRepository
    implements IAIRequestLogRepository
{
    public constructor(
        private readonly database: DatabaseManager
    ) {}

    public async create(
        log: AIRequestLog
    ): Promise<void> {
        await this.database.execute(
            `
                INSERT INTO core.AIRequestLogs (
                    id,
                    usage_record_id,
                    tenant_id,
                    user_id,
                    application_id,
                    correlation_id,
                    event,
                    timestamp,
                    metadata_json
                )
                VALUES (
                    @id,
                    @usageRecordId,
                    @tenantId,
                    @userId,
                    @applicationId,
                    @correlationId,
                    @event,
                    @timestamp,
                    @metadataJson
                )
            `,
            [
                { name: "id", value: log.id },
                {
                    name: "usageRecordId",
                    value: log.usageRecordId
                },
                { name: "tenantId", value: log.tenantId },
                { name: "userId", value: log.userId ?? null },
                {
                    name: "applicationId",
                    value: log.applicationId ?? null
                },
                {
                    name: "correlationId",
                    value: log.correlationId ?? null
                },
                { name: "event", value: log.event },
                { name: "timestamp", value: log.timestamp },
                {
                    name: "metadataJson",
                    value:
                        log.metadata === undefined
                            ? null
                            : JSON.stringify(log.metadata)
                }
            ]
        );
    }

    public async listByUsageRecord(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIRequestLog[]> {
        const result =
            await this.database.query<AIRequestLogRow>(
                `
                    SELECT
                        id,
                        usage_record_id,
                        tenant_id,
                        user_id,
                        application_id,
                        correlation_id,
                        event,
                        timestamp,
                        metadata_json
                    FROM core.AIRequestLogs
                    WHERE tenant_id = @tenantId
                      AND usage_record_id = @usageRecordId
                    ORDER BY timestamp ASC, id ASC
                `,
                [
                    { name: "tenantId", value: tenantId },
                    {
                        name: "usageRecordId",
                        value: usageRecordId
                    }
                ]
            );

        return result.rows.map(mapRow);
    }
}