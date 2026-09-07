import type { AIPolicyEvaluation } from "@intrusionshield/contracts";

export interface IAIPolicyEvaluationRepository {
    create(evaluation: AIPolicyEvaluation): Promise<void>;

    listByUsageRecord(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIPolicyEvaluation[]>;

    listByTenant(
        tenantId: string,
        periodStart?: string,
        periodEnd?: string
    ): Promise<AIPolicyEvaluation[]>;
}
