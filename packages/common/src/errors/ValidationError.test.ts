import { describe, expect, test } from "@jest/globals";
import { ApplicationError } from "./ApplicationError.js";
import { ErrorCode } from "./ErrorCode.js";
import { ErrorSeverity } from "./ErrorSeverity.js";
import { ValidationError } from "./ValidationError.js";

describe("ValidationError", () => {
    test("creates a validation error with the supplied message", () => {
        const error = new ValidationError("Invalid email address.");

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toBe("Invalid email address.");
    });

    test("uses VALIDATION_ERROR as the default error code", () => {
        const error = new ValidationError("Invalid email address.");

        expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    test("uses Warning severity", () => {
        const error = new ValidationError("Invalid email address.");

        expect(error.severity).toBe(ErrorSeverity.Warning);
    });

    test("sets the error name to ValidationError", () => {
        const error = new ValidationError("Invalid email address.");

        expect(error.name).toBe("ValidationError");
    });

    test("accepts a custom error code", () => {
        const error = new ValidationError(
            "User already exists.",
            ErrorCode.DUPLICATE_RECORD
        );

        expect(error.code).toBe(ErrorCode.DUPLICATE_RECORD);
        expect(error.severity).toBe(ErrorSeverity.Warning);
    });

    test("passes metadata to ApplicationError", () => {
        const metadata = {
            field: "email",
            value: "invalid"
        };

        const error = new ValidationError(
            "Invalid email address.",
            ErrorCode.VALIDATION_ERROR,
            metadata
        );

        expect(error.metadata).toEqual(metadata);
        expect(Object.isFrozen(error.metadata)).toBe(true);
    });

    test("preserves ApplicationError behavior", () => {
        const error = new ValidationError("Invalid input.");

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ApplicationError);
    });
});