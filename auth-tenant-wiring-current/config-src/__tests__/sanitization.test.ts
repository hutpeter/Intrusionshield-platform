import {
    sanitizeConfiguration
} from "../sanitization.js";

import type {
    Configuration
} from "../types/configuration.js";

describe(
    "sanitizeConfiguration",
    () => {
        it(
            "removes database credentials",
            () => {
                const configuration: Configuration = {
                    application: {
                        name: "IntrusionShield",
                        version: "1.0.0",
                        environment: "test",
                        host: "localhost",
                        port: 4000
                    },
                    database: {
                        server: "db",
                        port: 1433,
                        database: "intrusionshield",
                        schema: "dbo",
                        username: "admin",
                        password: "secret",
                        encrypt: true,
                        trustServerCertificate: false,
                        pool: {
                            max: 10,
                            min: 0
                        }
                    },
                    logging: {
                        level: "info",
                        format: "json",
                        console: true,
                        file: {
                            enabled: false,
                            path: ""
                        },
                        audit: {
                            enabled: true,
                            retentionDays: 365
                        }
                    },
                    features: {
                        aiHub: true,
                        workflow: true,
                        compliance: true,
                        analytics: true,
                        security: true
                    }
                };

                const sanitized =
                    sanitizeConfiguration(configuration);

                expect(sanitized.database).not.toHaveProperty(
                    "username"
                );

                expect(sanitized.database).not.toHaveProperty(
                    "password"
                );

                expect(
                    sanitized.database.credentialsConfigured
                ).toBe(true);
            }
        );
    }
);
