/**
 * IntrusionShield feature identifiers.
 */
export const FEATURES = {
    ISO27001: "COMPLIANCE.ISO27001",
    SOC2: "COMPLIANCE.SOC2",
    ITSG33: "COMPLIANCE.ITSG33",
    MFA: "AUTH.MFA",
    SSO: "AUTH.SSO"
} as const;

export type Feature =
    typeof FEATURES[keyof typeof FEATURES];
