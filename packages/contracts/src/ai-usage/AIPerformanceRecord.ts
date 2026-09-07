/**
 * Performance information associated with an AI request.
 */

import type {
    AIProvider,
    AIRequestType
} from "./AIUsageRecord.js";

export interface AIPerformanceRecord {

    readonly id: string;

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

    readonly recordedAt: string;
}
