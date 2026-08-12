import type { DatabaseConfiguration } from "./types/configuration.js";
import { getEnvironment } from "./environment.js";
import { developmentDatabaseDefaults } from "./defaults/development.js";
import { productionDatabaseDefaults } from "./defaults/production.js";
import { testDatabaseDefaults } from "./defaults/testDefaults.js";
import { ConfigurationError } from "./errors/ConfigurationError.js";

function parseBoolean(value: string | undefined, defaultValue: boolean, name: string): boolean {
    if (value === undefined) return defaultValue;
    switch (value.trim().toLowerCase()) {
        case "true": return true;
        case "false": return false;
        default: throw new ConfigurationError(`${name} must be either true or false.`, { name, value });
    }
}

function parseNumber(value: string | undefined, defaultValue: number, name: string): number {
    if (value === undefined) return defaultValue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new ConfigurationError(`${name} must be a valid number.`, { name, value });
    return parsed;
}

function requiredString(value: string | undefined, name: string): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (!normalized) throw new ConfigurationError(`${name} cannot be empty.`, { name });
    return normalized;
}

function getDefaults(): DatabaseConfiguration {
    switch (getEnvironment()) {
        case "production": return productionDatabaseDefaults;
        case "test": return testDatabaseDefaults;
        default: return developmentDatabaseDefaults;
    }
}

export function getDatabaseConfiguration(): DatabaseConfiguration {
    const defaults = getDefaults();
    const server = requiredString(process.env.DB_SERVER ?? defaults.server, "DB_SERVER");
    const database = requiredString(process.env.DB_DATABASE ?? process.env.DB_NAME ?? defaults.database, "DB_DATABASE");

    if (!server || !database) {
        throw new ConfigurationError("Database configuration is incomplete.", { required: ["DB_SERVER", "DB_DATABASE"] });
    }

    const schema = requiredString(process.env.DB_SCHEMA ?? defaults.schema, "DB_SCHEMA");
    if (!schema) throw new ConfigurationError("Database schema cannot be empty.", { name: "DB_SCHEMA" });

    const port = parseNumber(process.env.DB_PORT, defaults.port, "DB_PORT");
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new ConfigurationError("Database port is outside valid range.", { port });
    }

    const poolMax = parseNumber(process.env.DB_POOL_MAX, defaults.pool.max, "DB_POOL_MAX");
    const poolMin = parseNumber(process.env.DB_POOL_MIN, defaults.pool.min, "DB_POOL_MIN");
    if (!Number.isInteger(poolMin) || !Number.isInteger(poolMax) || poolMin < 0 || poolMax < 1 || poolMax < poolMin) {
        throw new ConfigurationError("Database connection pool configuration is invalid.", { poolMin, poolMax });
    }

    return {
        server,
        port,
        database,
        schema,
        username: requiredString(process.env.DB_USERNAME ?? process.env.DB_USER, "DB_USERNAME"),
        password: process.env.DB_PASSWORD,
        encrypt: parseBoolean(process.env.DB_ENCRYPT, defaults.encrypt, "DB_ENCRYPT"),
        trustServerCertificate: parseBoolean(process.env.DB_TRUST_SERVER_CERTIFICATE ?? process.env.DB_TRUST_CERT, defaults.trustServerCertificate, "DB_TRUST_SERVER_CERTIFICATE"),
        pool: { max: poolMax, min: poolMin }
    };
}
