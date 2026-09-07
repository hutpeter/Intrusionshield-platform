import { describe, expect, test } from "@jest/globals";
import { ApplicationError } from "./ApplicationError.js";
import { ErrorCode } from "./ErrorCode.js";
import { ErrorSeverity } from "./ErrorSeverity.js";

describe("ApplicationError", () => {
    test("creates an application error with the supplied code and message", () => {
        const error = new ApplicationError(
            ErrorCode.DATABASE_ERROR,
            "Database operation failed."
        );

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ApplicationError);
        expect(error.message).toBe("Database operation failed.");
        expect(error.code).toBe(ErrorCode.DATABASE_ERROR);
    });

    test("uses Error severity by default", () => {
        const error = new ApplicationError(
            ErrorCode.DATABASE_ERROR,
            "Database operation failed."
        );

        expect(error.severity).toBe(ErrorSeverity.Error);
    });

    test("accepts an explicit severity", () => {
        const error = new ApplicationError(
            ErrorCode.CONFIGURATION_ERROR,
            "Configuration warning.",
            ErrorSeverity.Warning
        );

        expect(error.severity).toBe(ErrorSeverity.Warning);
    });

    test("sets the error name to ApplicationError", () => {
        const error = new ApplicationError(
            ErrorCode.BUSINESS_RULE,
            "Business rule failed."
        );

        expect(error.name).toBe("ApplicationError");
    });

    test("stores metadata when supplied", () => {
        const metadata = {
            tenantId: "tenant-123",
            operation: "create"
        };

        const error = new ApplicationError(
            ErrorCode.DATABASE_ERROR,
            "Database operation failed.",
            ErrorSeverity.Error,
            metadata
        );

        expect(error.metadata).toEqual(metadata);
    });

    test("copies metadata rather than retaining the original object", () => {
        const metadata = {
            operation: "create"
        };

        const error = new ApplicationError(
            ErrorCode.BUSINESS_RULE,
            "Business rule failed.",
            ErrorSeverity.Error,
            metadata
        );

        metadata.operation = "update";

        expect(error.metadata).toEqual({
            operation: "create"
        });
    });

    test("freezes supplied metadata", () => {
        const error = new ApplicationError(
            ErrorCode.BUSINESS_RULE,
            "Business rule failed.",
            ErrorSeverity.Error,
            {
                operation: "create"
            }
        );

        expect(error.metadata).toBeDefined();
        expect(Object.isFrozen(error.metadata)).toBe(true);
    });

    test("leaves metadata undefined when it is not supplied", () => {
        const error = new ApplicationError(
            ErrorCode.UNKNOWN,
            "Unknown error."
        );

        expect(error.metadata).toBeUndefined();
    });
});