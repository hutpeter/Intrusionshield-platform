import type { AIRequestLog } from "@intrusionshield/contracts";

export interface IAIRequestLogRepository {
    create(log: AIRequestLog): Promise<void>;

    listByUsageRecord(
        tenantId: string,
        usageRecordId: string
    ): Promise<AIRequestLog[]>;
}
