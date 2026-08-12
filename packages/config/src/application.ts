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

export function getApplicationConfiguration():
    ApplicationConfiguration {

    const environment = getEnvironment();

    const defaults =
        environment === "production"
            ? productionApplicationDefaults
            : environment === "test"
                ? testApplicationDefaults
                : developmentApplicationDefaults;

    const rawPort =
        process.env.APP_PORT;

    const port = rawPort === undefined
        ? defaults.port
        : Number(rawPort);

    if (!Number.isFinite(port)) {
        throw new ConfigurationError(
            "Application port must be a valid number.",
            { name: "APP_PORT", value: rawPort }
        );
    }

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
            environment,

        host:
            process.env.APP_HOST ??
            defaults.host,

        port
    };
}
