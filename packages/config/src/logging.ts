import type {
    LoggingConfiguration
} from "./types/configuration.js";

import {
    getEnvironment
} from "./environment.js";

import {
    ConfigurationError
} from "./errors/ConfigurationError.js";

import {
    developmentLoggingDefaults
} from "./defaults/development.js";

import {
    productionLoggingDefaults
} from "./defaults/production.js";

import {
    testLoggingDefaults
} from "./defaults/testDefaults.js";

const VALID_LOG_LEVELS = new Set([
    "trace",
    "debug",
    "info",
    "warn",
    "error",
    "fatal",
    "silent"
]);

const VALID_LOG_FORMATS = new Set([
    "json",
    "text"
]);

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

function parseBoolean(
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

function parseNonNegativeInteger(
    value: string | undefined,
    defaultValue: number,
    name: string
): number {
    if (value === undefined) {
        return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ConfigurationError(
            `${name} must be a non-negative integer.`,
            { name, value }
        );
    }

    return parsed;
}

function parseLogLevel(
    value: string | undefined,
    defaultValue: string
): string {
    const level = value?.trim().toLowerCase() ?? defaultValue;

    if (!VALID_LOG_LEVELS.has(level)) {
        throw new ConfigurationError(
            "LOG_LEVEL is invalid.",
            {
                name: "LOG_LEVEL",
                value,
                allowedValues: [...VALID_LOG_LEVELS]
            }
        );
    }

    return level;
}

function parseLogFormat(
    value: string | undefined,
    defaultValue: string
): string {
    const format = value?.trim().toLowerCase() ?? defaultValue;

    if (!VALID_LOG_FORMATS.has(format)) {
        throw new ConfigurationError(
            "LOG_FORMAT is invalid.",
            {
                name: "LOG_FORMAT",
                value,
                allowedValues: [...VALID_LOG_FORMATS]
            }
        );
    }

    return format;
}

export function getLoggingConfiguration():
    LoggingConfiguration {

    const defaults = getDefaults();

    return {
        level: parseLogLevel(
            process.env.LOG_LEVEL,
            defaults.level
        ),

        format: parseLogFormat(
            process.env.LOG_FORMAT,
            defaults.format
        ),

        console: parseBoolean(
            process.env.LOG_CONSOLE,
            defaults.console,
            "LOG_CONSOLE"
        ),

        file: {
            enabled: parseBoolean(
                process.env.LOG_FILE_ENABLED,
                defaults.file.enabled,
                "LOG_FILE_ENABLED"
            ),

            path:
                process.env.LOG_FILE_PATH ??
                defaults.file.path
        },

        audit: {
            enabled: parseBoolean(
                process.env.AUDIT_LOGGING_ENABLED,
                defaults.audit.enabled,
                "AUDIT_LOGGING_ENABLED"
            ),

            retentionDays: parseNonNegativeInteger(
                process.env.AUDIT_RETENTION_DAYS,
                defaults.audit.retentionDays,
                "AUDIT_RETENTION_DAYS"
            )
        }
    };
}
