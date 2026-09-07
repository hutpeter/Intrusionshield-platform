import type { AIPerformanceRecord } from "@intrusionshield/contracts";

export interface IAIPerformanceRepository {
    create(record: AIPerformanceRecord): Promise<void>;

    getByUsageRecord(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIPerformanceRecord | null>;

    listByTenant(
        tenantId: string,
        periodStart?: string,
        periodEnd?: string
    ): Promise<AIPerformanceRecord[]>;
}
