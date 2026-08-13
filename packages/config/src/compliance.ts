import type { ComplianceConfiguration } from "./types/configuration.js";
import { ConfigurationError } from "./errors/ConfigurationError.js";

const MODES = new Set(["manual", "automated", "hybrid"]);

function booleanValue(value: string | undefined, fallback: boolean, name: string): boolean {
    if (value === undefined) return fallback;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new ConfigurationError(`${name} must be either true or false.`, { name, value });
}

function nonNegativeInteger(value: string | undefined, fallback: number, name: string): number {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ConfigurationError(`${name} must be a non-negative integer.`, { name, value });
    }
    return parsed;
}

export function getComplianceConfiguration(): ComplianceConfiguration {
    const assessmentMode = (process.env.COMPLIANCE_ASSESSMENT_MODE ?? "hybrid").trim().toLowerCase();
    if (!MODES.has(assessmentMode)) {
        throw new ConfigurationError("COMPLIANCE_ASSESSMENT_MODE is invalid.", { name: "COMPLIANCE_ASSESSMENT_MODE", value: assessmentMode });
    }

    return {
        enabled: booleanValue(process.env.COMPLIANCE_ENABLED, true, "COMPLIANCE_ENABLED"),
        defaultFramework: process.env.COMPLIANCE_DEFAULT_FRAMEWORK?.trim() || "ISO27001",
        assessmentMode: assessmentMode as ComplianceConfiguration["assessmentMode"],
        evidenceRetentionDays: nonNegativeInteger(process.env.COMPLIANCE_EVIDENCE_RETENTION_DAYS, 2555, "COMPLIANCE_EVIDENCE_RETENTION_DAYS")
    };
}
