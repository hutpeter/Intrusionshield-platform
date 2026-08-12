import type {
    LoggingConfiguration
} from "./types/configuration.js";

import {
    getEnvironment
} from "./environment.js";

import {
    developmentLoggingDefaults
} from "./defaults/development.js";

import {
    productionLoggingDefaults
} from "./defaults/production.js";

import {
    testLoggingDefaults
} from "./defaults/testDefaults.js";

function getDefaults(): LoggingConfiguration {
    switch (getEnvironment()) {
        case "production":
            return productionLoggingDefaults;

        case "test":
            return testLoggingDefaults;

        default:
            return developmentLoggingDefaults;
    }
}

export function getLoggingConfiguration():
    LoggingConfiguration {

    const defaults = getDefaults();

    const retentionDays = Number(
        process.env.AUDIT_RETENTION_DAYS ??
        defaults.audit.retentionDays
    );

    return {
        level:
            process.env.LOG_LEVEL ??
            defaults.level,

        format:
            process.env.LOG_FORMAT ??
            defaults.format,

        console:
            process.env.LOG_CONSOLE === undefined
                ? defaults.console
                : process.env.LOG_CONSOLE !== "false",

        file: {
            enabled:
                process.env.LOG_FILE_ENABLED === undefined
                    ? defaults.file.enabled
                    : process.env.LOG_FILE_ENABLED === "true",

            path:
                process.env.LOG_FILE_PATH ??
                defaults.file.path
        },

        audit: {
            enabled:
                process.env.AUDIT_LOGGING_ENABLED === undefined
                    ? defaults.audit.enabled
                    : process.env.AUDIT_LOGGING_ENABLED !== "false",

            retentionDays:
                Number.isFinite(retentionDays) &&
                retentionDays >= 0
                    ? retentionDays
                    : defaults.audit.retentionDays
        }
    };
}