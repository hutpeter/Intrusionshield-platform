/**
 * Aggregated AI usage information.
 *
 * Summaries may be generated at different aggregation levels,
 * from tenant-wide totals down to application, provider, model,
 * and request-type dimensions.
 */

import type {
    AIProvider,
    AIRequestType
} from "./AIUsageRecord.js";

export interface AIUsageSummary {

    /**
     * Tenant to which the usage belongs.
     */
    readonly tenantId: string;

    /**
     * Optional application dimension.
     */
    readonly applicationId?: string;

    /**
     * Optional AI provider dimension.
     */
    readonly provider?: AIProvider;

    /**
     * Optional model dimension.
     */
    readonly model?: string;

    /**
     * Optional request type dimension.
     */
    readonly requestType?: AIRequestType;

    /**
     * Beginning of the aggregation period.
     */
    readonly periodStart: string;

    /**
     * End of the aggregation period.
     */
    readonly periodEnd: string;

    readonly requestCount: number;

    readonly successfulRequestCount: number;

    readonly failedRequestCount: number;

    readonly blockedRequestCount: number;

    readonly rateLimitedRequestCount: number;

    readonly inputTokens: number;

    readonly outputTokens: number;

    readonly totalTokens: number;

    readonly estimatedCost: number;

    readonly currency: string;

    readonly averageLatencyMs?: number;
}
