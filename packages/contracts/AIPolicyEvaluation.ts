/**
 * AI Usage & Governance policy evaluation.
 */

export type AIPolicyDecision =
    | "allow"
    | "block"
    | "warn"
    | "require-review";

export interface AIPolicyEvaluation {

    readonly id: string;

    readonly usageRecordId: string;

    readonly tenantId: string;

    readonly policyId: string;

    readonly policyVersion?: string;

    readonly decision: AIPolicyDecision;

    /**
     * Human-readable reason for the decision.
     */
    readonly reason?: string;

    /**
     * Timestamp when the policy was evaluated.
     */
    readonly evaluatedAt: string;

    /**
     * Evaluation duration in milliseconds.
     */
    readonly evaluationLatencyMs?: number;
}