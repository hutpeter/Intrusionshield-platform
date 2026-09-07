/**
 * AI Usage & Governance
 *
 * Platform-neutral representation of an AI request.
 *
 * This contract is deliberately independent of any AI provider,
 * gateway, observability platform, or external usage-management
 * product.
 */

export type AIProvider =
    | "openai"
    | "azure-openai"
    | "anthropic"
    | "google"
    | "aws-bedrock"
    | "other";

export type AIRequestType =
    | "chat"
    | "completion"
    | "embedding"
    | "image"
    | "audio"
    | "moderation";

export type AIRequestStatus =
    | "pending"
    | "success"
    | "error"
    | "blocked"
    | "rate-limited";

export interface AIUsageRecord {

    /**
     * Unique identifier for this AI request.
     */
    readonly id: string;

    /**
     * Tenant responsible for the request.
     */
    readonly tenantId: string;

    /**
     * User who initiated the request, when known.
     */
    readonly userId?: string;

    /**
     * Application/client responsible for the request.
     */
    readonly applicationId?: string;

    /**
     * AI provider used to fulfill the request.
     */
    readonly provider: AIProvider;

    /**
     * Provider model identifier.
     */
    readonly model: string;

    /**
     * Type of AI operation.
     */
    readonly requestType: AIRequestType;

    /**
     * Current processing status.
     */
    readonly status: AIRequestStatus;

    /**
     * Correlation identifier used across platform services.
     */
    readonly correlationId?: string;

    /**
     * Timestamp when processing began.
     */
    readonly startedAt: string;

    /**
     * Timestamp when processing completed.
     */
    readonly completedAt?: string;

    /**
     * Total request latency in milliseconds.
     */
    readonly latencyMs?: number;

    /**
     * Input token consumption.
     */
    readonly inputTokens?: number;

    /**
     * Output token consumption.
     */
    readonly outputTokens?: number;

    /**
     * Total token consumption.
     */
    readonly totalTokens?: number;

    /**
     * Calculated provider cost.
     */
    readonly estimatedCost?: number;

    /**
     * Currency used for the estimated cost.
     */
    readonly currency?: string;

    /**
     * Error information when processing failed.
     */
    readonly errorCode?: string;

    /**
     * External provider request identifier.
     */
    readonly providerRequestId?: string;

    /**
     * External source of the usage record.
     *
     * Examples:
     * - disruptor
     * - usage-panda
     * - openai
     * - azure-openai
     */
    readonly source: string;

    /**
     * Creation timestamp of the platform record.
     */
    readonly createdAt: string;
}