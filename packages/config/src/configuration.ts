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

/**
 * Builds the complete IntrusionShield configuration.
 */
function buildConfiguration(): Configuration {
    loadEnvironment();

    return {
        application:
            getApplicationConfiguration(),

        database:
            getDatabaseConfiguration(),

        logging:
            getLoggingConfiguration(),

        features:
            getFeaturesConfiguration()
    };
}

/**
 * Returns the complete IntrusionShield configuration.
 *
 * Configuration is initialized lazily and cached for the
 * lifetime of the process.
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
 * Primarily useful for tests and controlled runtime
 * reconfiguration.
 */
export function resetConfiguration(): void {
    configuration = undefined;
}