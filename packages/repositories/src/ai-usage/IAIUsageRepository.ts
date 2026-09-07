import type { AIUsageRecord } from "@intrusionshield/contracts";

export interface IAIUsageRepository {
    create(record: AIUsageRecord): Promise<void>;

    update(record: AIUsageRecord): Promise<void>;

    getById(
        tenantId: string,
        id: string
    ): Promise<AIUsageRecord | null>;

    listByTenant(
        tenantId: string,
        periodStart?: string,
        periodEnd?: string
    ): Promise<AIUsageRecord[]>;
}
