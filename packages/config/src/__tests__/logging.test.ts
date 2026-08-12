import {
    afterEach,
    beforeEach,
    describe,
    expect,
    test
} from "@jest/globals";

import {
    getLoggingConfiguration
} from "../logging.js";

import {
    ConfigurationError
} from "../errors/ConfigurationError.js";

describe(
    "logging configuration validation",
    () => {
        const originalEnvironment = process.env;

        beforeEach(() => {
            process.env = {
                ...originalEnvironment,
                NODE_ENV: "test"
            };

            delete process.env.LOG_LEVEL;
            delete process.env.LOG_FORMAT;
            delete process.env.LOG_CONSOLE;
            delete process.env.LOG_FILE_ENABLED;
            delete process.env.LOG_FILE_PATH;
            delete process.env.AUDIT_LOGGING_ENABLED;
            delete process.env.AUDIT_RETENTION_DAYS;
        });

        afterEach(() => {
            process.env = originalEnvironment;
        });

        test("accepts valid logging values", () => {
            process.env.LOG_LEVEL = "WARN";
            process.env.LOG_FORMAT = "TEXT";
            process.env.LOG_CONSOLE = "true";
            process.env.LOG_FILE_ENABLED = "false";
            process.env.AUDIT_LOGGING_ENABLED = "true";
            process.env.AUDIT_RETENTION_DAYS = "730";

            expect(getLoggingConfiguration()).toEqual({
                level: "warn",
                format: "text",
                console: true,
                file: {
                    enabled: false,
                    path: "./logs/test.log"
                },
                audit: {
                    enabled: true,
                    retentionDays: 730
                }
            });
        });

        test("rejects invalid boolean values", () => {
            process.env.LOG_CONSOLE = "yes";

            expect(() => getLoggingConfiguration())
                .toThrow(ConfigurationError);
        });

        test("rejects invalid log levels", () => {
            process.env.LOG_LEVEL = "verbose";

            expect(() => getLoggingConfiguration())
                .toThrow(ConfigurationError);
        });

        test("rejects invalid log formats", () => {
            process.env.LOG_FORMAT = "xml";

            expect(() => getLoggingConfiguration())
                .toThrow(ConfigurationError);
        });

        test("rejects negative audit retention", () => {
            process.env.AUDIT_RETENTION_DAYS = "-1";

            expect(() => getLoggingConfiguration())
                .toThrow(ConfigurationError);
        });

        test("rejects fractional audit retention", () => {
            process.env.AUDIT_RETENTION_DAYS = "30.5";

            expect(() => getLoggingConfiguration())
                .toThrow(ConfigurationError);
        });
    }
);
