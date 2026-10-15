import type {
    ApplicationConfiguration,
    DatabaseConfiguration,
    LoggingConfiguration
} from "../types/configuration.js";

export const productionApplicationDefaults:
    ApplicationConfiguration = {
        name: "IntrusionShield",
        version: "1.0.0",
        environment: "production",
        host: "0.0.0.0",
        port: 4000
    };

export const productionDatabaseDefaults:
    DatabaseConfiguration = {
        server: "",
        port: 1433,
        database: "",
        schema: "dbo",
        encrypt: true,
        trustServerCertificate: false,
        pool: {
            max: 50,
            min: 5
        }
    };

export const productionLoggingDefaults:
    LoggingConfiguration = {
        level: "info",
        format: "json",
        console: true,
        file: {
            enabled: true,
            path: "./logs/intrusionshield.log"
        },
        audit: {
            enabled: true,
            retentionDays: 365
        }
    };