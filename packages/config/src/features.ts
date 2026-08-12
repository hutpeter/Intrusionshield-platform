import type {
    FeaturesConfiguration
} from "./types/configuration.js";

export function getFeaturesConfiguration():
    FeaturesConfiguration {

    return {
        aiHub:
            process.env.FEATURE_AI_HUB !== "false",

        workflow:
            process.env.FEATURE_WORKFLOW !== "false",

        compliance:
            process.env.FEATURE_COMPLIANCE !== "false",

        analytics:
            process.env.FEATURE_ANALYTICS !== "false",

        security:
            process.env.FEATURE_SECURITY !== "false"
    };
}