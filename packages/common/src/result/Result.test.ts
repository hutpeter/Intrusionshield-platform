import { describe, expect, test } from "@jest/globals";
import { Result } from "./Result.js";

describe("Result", () => {
    describe("success", () => {
        test("creates a successful result with a value", () => {
            const result = Result.success("value");

            expect(result.isSuccess).toBe(true);
            expect(result.isFailure).toBe(false);
            expect(result.value).toBe("value");
            expect(result.error).toBeUndefined();
        });

        test("creates a successful void result", () => {
            const result = Result.successVoid();

            expect(result.isSuccess).toBe(true);
            expect(result.isFailure).toBe(false);
            expect(result.value).toBeUndefined();
            expect(result.error).toBeUndefined();
        });

        test("ensure returns the successful value", () => {
            const result = Result.success(42);

            expect(result.ensure()).toBe(42);
        });
    });

    describe("failure", () => {
        test("creates a failed result with an error message", () => {
            const result = Result.failure("Operation failed.");

            expect(result.isSuccess).toBe(false);
            expect(result.isFailure).toBe(true);
            expect(result.value).toBeUndefined();
            expect(result.error).toBe("Operation failed.");
        });

        test("rejects an empty error message", () => {
            expect(() => Result.failure("")).toThrow(
                "A Result failure requires an error message."
            );
        });

        test("rejects a whitespace-only error message", () => {
            expect(() => Result.failure("   ")).toThrow(
                "A Result failure requires an error message."
            );
        });

        test("ensure throws the failure message", () => {
            const result = Result.failure("Operation failed.");

            expect(() => result.ensure()).toThrow("Operation failed.");
        });
    });
});