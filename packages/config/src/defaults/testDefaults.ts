import type {
    ApplicationConfiguration,
    DatabaseConfiguration,
    LoggingConfiguration
} from "../types/configuration.js";

export const testApplicationDefaults:
    ApplicationConfiguration = {
        name: "IntrusionShield",
        version: "1.0.0",
        environment: "test",
        host: "localhost",
        port: 0
    };

export const testDatabaseDefaults:
    DatabaseConfiguration = {
        server: "localhost",
        port: 1433,
        database: "intrusionshield_test",
        schema: "dbo",
        encrypt: false,
        trustServerCertificate: true,
        pool: {
            max: 5,
            min: 0
        }
    };

export const testLoggingDefaults:
    LoggingConfiguration = {
        level: "silent",
        format: "json",
        console: false,
        file: {
            enabled: false,
            path: "./logs/test.log"
        },
        audit: {
            enabled: false,
            retentionDays: 1
        }
    };