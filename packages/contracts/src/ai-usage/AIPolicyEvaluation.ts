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
    readonly reason?: string;
    readonly evaluatedAt: string;
    readonly evaluationLatencyMs?: number;
}
