import { describe, expect, test } from "@jest/globals";
import { CorrelationId } from "./CorrelationId.js";

describe("CorrelationId", () => {
    test("creates a correlation ID with a generated UUID", () => {
        const correlationId = CorrelationId.create();

        expect(correlationId.value).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    });

    test("creates a correlation ID with a supplied value", () => {
        const correlationId = CorrelationId.create("correlation-123");

        expect(correlationId.value).toBe("correlation-123");
    });

    test("returns the correlation ID from toString", () => {
        const correlationId = CorrelationId.create("correlation-123");

        expect(correlationId.toString()).toBe("correlation-123");
    });

    test("compares equal correlation IDs as equal value objects", () => {
        const first = CorrelationId.create("correlation-123");
        const second = CorrelationId.create("correlation-123");

        expect(first.equals(second)).toBe(true);
    });

    test("compares different correlation IDs as unequal", () => {
        const first = CorrelationId.create("correlation-123");
        const second = CorrelationId.create("correlation-456");

        expect(first.equals(second)).toBe(false);
    });

    test("generates different correlation IDs for separate calls", () => {
        const first = CorrelationId.create();
        const second = CorrelationId.create();

        expect(first.value).not.toBe(second.value);
    });
});