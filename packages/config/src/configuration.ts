import type {
    Configuration
} from "./types/configuration.js";

import {
    loadEnvironment
} from "./environment.js";

import {
    getApplicationConfiguration
} from "./application.js";

import {
    getDatabaseConfiguration
} from "./database.js";

import {
    getLoggingConfiguration
} from "./logging.js";

import {
    getFeaturesConfiguration
} from "./features.js";

let configuration:
    Configuration | undefined;

function deepFreeze<T>(value: T): T {
    if (
        value !== null &&
        typeof value === "object"
    ) {
        for (const child of Object.values(
            value as Record<string, unknown>
        )) {
            deepFreeze(child);
        }

        Object.freeze(value);
    }

    return value;
}

/**
 * Builds the complete IntrusionShield configuration.
 */
function buildConfiguration(): Configuration {
    loadEnvironment();

    return deepFreeze({
        application:
            getApplicationConfiguration(),

        database:
            getDatabaseConfiguration(),

        logging:
            getLoggingConfiguration(),

        features:
            getFeaturesConfiguration()
    });
}

/**
 * Returns the complete IntrusionShield configuration.
 *
 * Configuration is initialized lazily, deeply frozen, and cached
 * for the lifetime of the process.
 */
export function getConfiguration():
    Configuration {

    if (!configuration) {
        configuration =
            buildConfiguration();
    }

    return configuration;
}

/**
 * Clears the cached configuration.
 *
 * Primarily useful for tests and controlled runtime reconfiguration.
 */
export function resetConfiguration(): void {
    configuration = undefined;
}
