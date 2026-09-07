import { describe, expect, test } from "@jest/globals";
import { Identifier } from "./Identifier.js";

describe("Identifier", () => {
    test("creates an identifier with a generated UUID", () => {
        const identifier = Identifier.create();

        expect(identifier.value).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
    });

    test("creates an identifier with a supplied value", () => {
        const identifier = Identifier.create("custom-id");

        expect(identifier.value).toBe("custom-id");
    });

    test("returns the identifier from toString", () => {
        const identifier = Identifier.create("custom-id");

        expect(identifier.toString()).toBe("custom-id");
    });

    test("compares equal identifiers as equal value objects", () => {
        const first = Identifier.create("custom-id");
        const second = Identifier.create("custom-id");

        expect(first.equals(second)).toBe(true);
    });

    test("compares different identifiers as unequal", () => {
        const first = Identifier.create("first-id");
        const second = Identifier.create("second-id");

        expect(first.equals(second)).toBe(false);
    });

    test("generates different identifiers for separate calls", () => {
        const first = Identifier.create();
        const second = Identifier.create();

        expect(first.value).not.toBe(second.value);
    });
});