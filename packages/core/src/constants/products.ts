/**
 * IntrusionShield platform products/modules.
 */
export const PRODUCTS = {
    AUTHENTICATION: "AUTHENTICATION",
    COMPLIANCE: "COMPLIANCE",
    SECURITY_ANALYTICS: "SECURITY_ANALYTICS",
    WORKFLOW: "WORKFLOW",
    AI_HUB: "AI_HUB"
} as const;

export type Product =
    typeof PRODUCTS[keyof typeof PRODUCTS];

