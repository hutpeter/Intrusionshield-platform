import type {
    ApplicationConfiguration
} from "./types/configuration.js";

import {
    getEnvironment
} from "./environment.js";

import {
    developmentApplicationDefaults
} from "./defaults/development.js";

import {
    productionApplicationDefaults
} from "./defaults/production.js";

import {
    testApplicationDefaults
} from "./defaults/testDefaults.js";

import {
    ConfigurationError
} from "./errors/ConfigurationError.js";

function getDefaults(): ApplicationConfiguration {
    switch (getEnvironment()) {
        case "production":
            return productionApplicationDefaults;

        case "test":
            return testApplicationDefaults;

        default:
            return developmentApplicationDefaults;
    }
}

export function getApplicationConfiguration():
    ApplicationConfiguration {

    const defaults = getDefaults();

    const port = Number(
        process.env.APP_PORT ??
        defaults.port
    );

    if (
        !Number.isInteger(port) ||
        port < 0 ||
        port > 65535
    ) {
        throw new ConfigurationError(
            "Application port is outside valid range.",
            { port }
        );
    }

    return {
        name:
            process.env.APP_NAME ??
            defaults.name,

        version:
            process.env.APP_VERSION ??
            defaults.version,

        environment:
            process.env.NODE_ENV ??
            defaults.environment,

        host:
            process.env.APP_HOST ??
            defaults.host,

        port
    };
}