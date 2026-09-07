/**
 * AI request audit/log record.
 *
 * This represents platform-owned AI activity history.
 *
 * External providers such as Usage Panda may supply
 * additional telemetry, but the platform can retain
 * its own normalized record.
 */

export type AIRequestLogEvent =
    | "request-created"
    | "policy-evaluated"
    | "request-sent"
    | "response-received"
    | "request-completed"
    | "request-failed"
    | "request-blocked"
    | "request-rate-limited";

export interface AIRequestLog {

    readonly id: string;

    readonly usageRecordId: string;

    readonly tenantId: string;

    readonly userId?: string;

    readonly applicationId?: string;

    readonly correlationId?: string;

    readonly event: AIRequestLogEvent;

    readonly timestamp: string;

    /**
     * Optional structured metadata associated with the event.
     */
    readonly metadata?: Record<string, unknown>;
}