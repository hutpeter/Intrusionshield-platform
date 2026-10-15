import type { DatabaseManager } from "@intrusionshield/database";
import type { AIPolicyEvaluation } from "@intrusionshield/contracts";
import type { IAIPolicyEvaluationRepository } from "./IAIPolicyEvaluationRepository.js";

interface AIPolicyEvaluationRow {
    id: string;
    usage_record_id: string;
    tenant_id: string;
    policy_id: string;
    policy_version: string | null;
    decision: AIPolicyEvaluation["decision"];
    reason: string | null;
    evaluated_at: Date | string;
    evaluation_latency_ms: number | null;
}

function toISOString(value: Date | string): string {
    return value instanceof Date
        ? value.toISOString()
        : value;
}

function mapRow(
    row: AIPolicyEvaluationRow
): AIPolicyEvaluation {
    return {
        id: row.id,
        usageRecordId: row.usage_record_id,
        tenantId: row.tenant_id,
        policyId: row.policy_id,
        ...(row.policy_version !== null && {
            policyVersion: row.policy_version
        }),
        decision: row.decision,
        ...(row.reason !== null && {
            reason: row.reason
        }),
        evaluatedAt: toISOString(row.evaluated_at),
        ...(row.evaluation_latency_ms !== null && {
            evaluationLatencyMs:
                row.evaluation_latency_ms
        })
    };
}

export class AIPolicyEvaluationRepository
    implements IAIPolicyEvaluationRepository
{
    public constructor(
        private readonly database: DatabaseManager
    ) {}

    public async create(
        evaluation: AIPolicyEvaluation
    ): Promise<void> {
        await this.database.execute(
            `
                INSERT INTO core.AIPolicyEvaluations (
                    id,
                    usage_record_id,
                    tenant_id,
                    policy_id,
                    policy_version,
                    decision,
                    reason,
                    evaluated_at,
                    evaluation_latency_ms
                )
                VALUES (
                    @id,
                    @usageRecordId,
                    @tenantId,
                    @policyId,
                    @policyVersion,
                    @decision,
                    @reason,
                    @evaluatedAt,
                    @evaluationLatencyMs
                )
            `,
            [
                { name: "id", value: evaluation.id },
                {
                    name: "usageRecordId",
                    value: evaluation.usageRecordId
                },
                {
                    name: "tenantId",
                    value: evaluation.tenantId
                },
                {
                    name: "policyId",
                    value: evaluation.policyId
                },
                {
                    name: "policyVersion",
                    value: evaluation.policyVersion ?? null
                },
                {
                    name: "decision",
                    value: evaluation.decision
                },
                {
                    name: "reason",
                    value: evaluation.reason ?? null
                },
                {
                    name: "evaluatedAt",
                    value: evaluation.evaluatedAt
                },
                {
                    name: "evaluationLatencyMs",
                    value:
                        evaluation.evaluationLatencyMs ?? null
                }
            ]
        );
    }

    public async listByUsageRecord(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIPolicyEvaluation[]> {
        const result =
            await this.database.query<AIPolicyEvaluationRow>(
                `
                    SELECT
                        id,
                        usage_record_id,
                        tenant_id,
                        policy_id,
                        policy_version,
                        decision,
                        reason,
                        evaluated_at,
                        evaluation_latency_ms
                    FROM core.AIPolicyEvaluations
                    WHERE tenant_id = @tenantId
                      AND usage_record_id = @usageRecordId
                    ORDER BY evaluated_at ASC, id ASC
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

    public async listByTenant(
        tenantId: string,
        periodStart?: string,
        periodEnd?: string
    ): Promise<AIPolicyEvaluation[]> {
        const parameters = [
            { name: "tenantId", value: tenantId }
        ];

        let periodClause = "";

        if (periodStart !== undefined) {
            periodClause +=
                " AND evaluated_at >= @periodStart";
            parameters.push({
                name: "periodStart",
                value: periodStart
            });
        }

        if (periodEnd !== undefined) {
            periodClause +=
                " AND evaluated_at <= @periodEnd";
            parameters.push({
                name: "periodEnd",
                value: periodEnd
            });
        }

        const result =
            await this.database.query<AIPolicyEvaluationRow>(
                `
                    SELECT
                        id,
                        usage_record_id,
                        tenant_id,
                        policy_id,
                        policy_version,
                        decision,
                        reason,
                        evaluated_at,
                        evaluation_latency_ms
                    FROM core.AIPolicyEvaluations
                    WHERE tenant_id = @tenantId
                    ${periodClause}
                    ORDER BY evaluated_at DESC, id DESC
                `,
                parameters
            );

        return result.rows.map(mapRow);
    }
}