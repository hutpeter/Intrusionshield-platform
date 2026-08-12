import type {
    FeaturesConfiguration
} from "./types/configuration.js";

import {
    ConfigurationError
} from "./errors/ConfigurationError.js";

function parseFeatureFlag(
    value: string | undefined,
    defaultValue: boolean,
    name: string
): boolean {
    if (value === undefined) {
        return defaultValue;
    }

    switch (value.trim().toLowerCase()) {
        case "true":
            return true;

        case "false":
            return false;

        default:
            throw new ConfigurationError(
                `${name} must be either true or false.`,
                { name, value }
            );
    }
}

export function getFeaturesConfiguration():
    FeaturesConfiguration {

    return {
        aiHub: parseFeatureFlag(
            process.env.FEATURE_AI_HUB,
            true,
            "FEATURE_AI_HUB"
        ),

        workflow: parseFeatureFlag(
            process.env.FEATURE_WORKFLOW,
            true,
            "FEATURE_WORKFLOW"
        ),

        compliance: parseFeatureFlag(
            process.env.FEATURE_COMPLIANCE,
            true,
            "FEATURE_COMPLIANCE"
        ),

        analytics: parseFeatureFlag(
            process.env.FEATURE_ANALYTICS,
            true,
            "FEATURE_ANALYTICS"
        ),

        security: parseFeatureFlag(
            process.env.FEATURE_SECURITY,
            true,
            "FEATURE_SECURITY"
        )
    };
}
