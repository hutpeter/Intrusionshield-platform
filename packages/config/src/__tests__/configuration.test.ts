import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test
} from "@jest/globals";

import {
    getConfiguration,
    resetConfiguration
} from "../configuration.js";

import {
    ConfigurationError
} from "../errors/ConfigurationError.js";

describe(
    "@intrusionshield/config",
    () => {

        const originalEnvironment =
            process.env;

        beforeEach(() => {
            process.env = {
                ...originalEnvironment
            };

            delete process.env.APP_NAME;
            delete process.env.APP_VERSION;
            delete process.env.APP_HOST;
            delete process.env.APP_PORT;

            delete process.env.DB_SERVER;
            delete process.env.DB_DATABASE;
            delete process.env.DB_NAME;
            delete process.env.DB_PORT;
            delete process.env.DB_SCHEMA;
            delete process.env.DB_USERNAME;
            delete process.env.DB_USER;
            delete process.env.DB_PASSWORD;
            delete process.env.DB_ENCRYPT;
            delete process.env.DB_TRUST_SERVER_CERTIFICATE;
            delete process.env.DB_TRUST_CERT;
            delete process.env.DB_POOL_MAX;
            delete process.env.DB_POOL_MIN;

            delete process.env.LOG_LEVEL;
            delete process.env.LOG_FORMAT;
            delete process.env.LOG_CONSOLE;
            delete process.env.LOG_FILE_ENABLED;
            delete process.env.LOG_FILE_PATH;
            delete process.env.AUDIT_LOGGING_ENABLED;
            delete process.env.AUDIT_RETENTION_DAYS;

            delete process.env.FEATURE_AI_HUB;
            delete process.env.FEATURE_WORKFLOW;
            delete process.env.FEATURE_COMPLIANCE;
            delete process.env.FEATURE_ANALYTICS;
            delete process.env.FEATURE_SECURITY;

            process.env.NODE_ENV = "test";

            resetConfiguration();
        });

        afterEach(() => {
            process.env = originalEnvironment;

            resetConfiguration();
        });

        test(
            "builds the complete test configuration",
            () => {
                const configuration =
                    getConfiguration();

                expect(configuration).toBeDefined();

                expect(configuration.application).toBeDefined();
                expect(configuration.database).toBeDefined();
                expect(configuration.logging).toBeDefined();
                expect(configuration.features).toBeDefined();
            }
        );

        test(
            "uses test application defaults",
            () => {
                const configuration =
                    getConfiguration();

                expect(
                    configuration.application
                ).toEqual({
                    name: "IntrusionShield",
                    version: "1.0.0",
                    environment: "test",
                    host: "localhost",
                    port: 0
                });
            }
        );

        test(
            "uses test database defaults",
            () => {
                const configuration =
                    getConfiguration();

                expect(
                    configuration.database
                ).toEqual({
                    server: "localhost",
                    port: 1433,
                    database: "intrusionshield_test",
                    schema: "dbo",
                    username: undefined,
                    password: undefined,
                    encrypt: false,
                    trustServerCertificate: true,
                    pool: {
                        max: 5,
                        min: 0
                    }
                });
            }
        );

        test(
            "uses test logging defaults",
            () => {
                const configuration =
                    getConfiguration();

                expect(
                    configuration.logging
                ).toEqual({
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
                });
            }
        );

        test(
            "enables platform features by default",
            () => {
                const configuration =
                    getConfiguration();

                expect(
                    configuration.features
                ).toEqual({
                    aiHub: true,
                    workflow: true,
                    compliance: true,
                    analytics: true,
                    security: true
                });
            }
        );

        test(
            "allows application environment overrides",
            () => {
                process.env.APP_NAME =
                    "Custom Application";

                process.env.APP_VERSION =
                    "2.5.0";

                process.env.APP_HOST =
                    "127.0.0.1";

                process.env.APP_PORT =
                    "8080";

                resetConfiguration();

                const configuration =
                    getConfiguration();

                expect(
                    configuration.application
                ).toEqual({
                    name: "Custom Application",
                    version: "2.5.0",
                    environment: "test",
                    host: "127.0.0.1",
                    port: 8080
                });
            }
        );

        test(
            "allows database environment overrides",
            () => {
                process.env.DB_SERVER =
                    "sqlserver01";

                process.env.DB_DATABASE =
                    "intrusionshield";

                process.env.DB_PORT =
                    "1444";

                process.env.DB_SCHEMA =
                    "security";

                process.env.DB_USERNAME =
                    "platform_user";

                process.env.DB_PASSWORD =
                    "secret";

                process.env.DB_ENCRYPT =
                    "true";

                process.env.DB_TRUST_SERVER_CERTIFICATE =
                    "false";

                process.env.DB_POOL_MAX =
                    "25";

                process.env.DB_POOL_MIN =
                    "5";

                resetConfiguration();

                const configuration =
                    getConfiguration();

                expect(
                    configuration.database
                ).toEqual({
                    server: "sqlserver01",
                    port: 1444,
                    database: "intrusionshield",
                    schema: "security",
                    username: "platform_user",
                    password: "secret",
                    encrypt: true,
                    trustServerCertificate: false,
                    pool: {
                        max: 25,
                        min: 5
                    }
                });
            }
        );

        test(
            "supports DB_NAME as a database fallback",
            () => {
                process.env.DB_SERVER =
                    "sqlserver01";

                process.env.DB_NAME =
                    "intrusionshield";

                delete process.env.DB_DATABASE;

                resetConfiguration();

                const configuration =
                    getConfiguration();

                expect(
                    configuration.database.database
                ).toBe("intrusionshield");
            }
        );

        test(
            "allows feature flags to be disabled",
            () => {
                process.env.FEATURE_AI_HUB =
                    "false";

                process.env.FEATURE_WORKFLOW =
                    "false";

                process.env.FEATURE_COMPLIANCE =
                    "false";

                process.env.FEATURE_ANALYTICS =
                    "false";

                process.env.FEATURE_SECURITY =
                    "false";

                resetConfiguration();

                const configuration =
                    getConfiguration();

                expect(
                    configuration.features
                ).toEqual({
                    aiHub: false,
                    workflow: false,
                    compliance: false,
                    analytics: false,
                    security: false
                });
            }
        );

        test(
            "allows logging configuration overrides",
            () => {
                process.env.LOG_LEVEL =
                    "warn";

                process.env.LOG_FORMAT =
                    "text";

                process.env.LOG_CONSOLE =
                    "true";

                process.env.LOG_FILE_ENABLED =
                    "true";

                process.env.LOG_FILE_PATH =
                    "./custom.log";

                process.env.AUDIT_LOGGING_ENABLED =
                    "true";

                process.env.AUDIT_RETENTION_DAYS =
                    "730";

                resetConfiguration();

                const configuration =
                    getConfiguration();

                expect(
                    configuration.logging
                ).toEqual({
                    level: "warn",
                    format: "text",
                    console: true,
                    file: {
                        enabled: true,
                        path: "./custom.log"
                    },
                    audit: {
                        enabled: true,
                        retentionDays: 730
                    }
                });
            }
        );

        test(
            "caches configuration until reset",
            () => {
                const first =
                    getConfiguration();

                process.env.APP_NAME =
                    "Changed After Initialization";

                const second =
                    getConfiguration();

                expect(second).toBe(first);

                expect(
                    second.application.name
                ).toBe("IntrusionShield");
            }
        );

        test(
            "resetConfiguration clears the configuration cache",
            () => {
                const first =
                    getConfiguration();

                process.env.APP_NAME =
                    "New Application";

                resetConfiguration();

                const second =
                    getConfiguration();

                expect(second).not.toBe(first);

                expect(
                    second.application.name
                ).toBe("New Application");
            }
        );

        test(
            "rejects an invalid application port",
            () => {
                process.env.APP_PORT =
                    "70000";

                resetConfiguration();

                expect(
                    () => getConfiguration()
                ).toThrow(ConfigurationError);
            }
        );

        test(
            "rejects an invalid database port",
            () => {
                process.env.DB_PORT =
                    "70000";

                resetConfiguration();

                expect(
                    () => getConfiguration()
                ).toThrow(ConfigurationError);
            }
        );

        test(
            "rejects an invalid database pool configuration",
            () => {
                process.env.DB_POOL_MIN =
                    "20";

                process.env.DB_POOL_MAX =
                    "10";

                resetConfiguration();

                expect(
                    () => getConfiguration()
                ).toThrow(ConfigurationError);
            }
        );

        test(
            "throws when production database configuration is incomplete",
            () => {
                process.env.NODE_ENV =
                    "production";

                delete process.env.DB_SERVER;
                delete process.env.DB_DATABASE;

                resetConfiguration();

                expect(
                    () => getConfiguration()
                ).toThrow(ConfigurationError);
            }
        );

        test(
            "accepts valid production database configuration",
            () => {
                process.env.NODE_ENV =
                    "production";

                process.env.DB_SERVER =
                    "production-sql";

                process.env.DB_DATABASE =
                    "intrusionshield";

                resetConfiguration();

                const configuration =
                    getConfiguration();

                expect(
                    configuration.application.environment
                ).toBe("production");

                expect(
                    configuration.database.server
                ).toBe("production-sql");

                expect(
                    configuration.database.database
                ).toBe("intrusionshield");

                expect(
                    configuration.database.encrypt
                ).toBe(true);

                expect(
                    configuration.database.trustServerCertificate
                ).toBe(false);
            }
        );

        test(
            "returns a ConfigurationError with details",
            () => {
                process.env.APP_PORT =
                    "70000";

                resetConfiguration();

                try {
                    getConfiguration();

                    throw new Error(
                        "Expected ConfigurationError to be thrown."
                    );
                } catch (error) {
                    expect(
                        error
                    ).toBeInstanceOf(
                        ConfigurationError
                    );

                    const configurationError =
                        error as ConfigurationError;

                    expect(
                        configurationError.message
                    ).toBe(
                        "Application port is outside valid range."
                    );

                    expect(
                        configurationError.details
                    ).toEqual({
                        port: 70000
                    });
                }
            }
        );
    }
);