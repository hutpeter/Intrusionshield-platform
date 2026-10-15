import type {
    ApplicationConfiguration,
    DatabaseConfiguration,
    LoggingConfiguration
} from "../types/configuration.js";

export const developmentApplicationDefaults:
    ApplicationConfiguration = {
        name: "IntrusionShield",
        version: "1.0.0",
        environment: "development",
        host: "localhost",
        port: 4000
    };

export const developmentDatabaseDefaults:
    DatabaseConfiguration = {
        server: "localhost",
        port: 1433,
        database: "intrusionshield",
        schema: "dbo",
        encrypt: false,
        trustServerCertificate: true,
        pool: {
            max: 10,
            min: 0
        }
    };

export const developmentLoggingDefaults:
    LoggingConfiguration = {
        level: "debug",
        format: "json",
        console: true,
        file: {
            enabled: false,
            path: "./logs/intrusionshield.log"
        },
        audit: {
            enabled: true,
            retentionDays: 365
        }
    };