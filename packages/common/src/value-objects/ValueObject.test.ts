import { describe, expect, test } from "@jest/globals";
import { Money } from "./money.js";
import { Percentage } from "./percentage.js";

describe("ValueObject", () => {
    describe("equals", () => {
        test("returns true for equal primitive values", () => {
            const first = Percentage.create(25);
            const second = Percentage.create(25);

            expect(first.equals(second)).toBe(true);
        });

        test("returns false for different primitive values", () => {
            const first = Percentage.create(25);
            const second = Percentage.create(50);

            expect(first.equals(second)).toBe(false);
        });

        test("returns false when the other value object is undefined", () => {
            const percentage = Percentage.create(25);

            expect(percentage.equals()).toBe(false);
        });

        test("compares structured values by content", () => {
            const first = Money.create(100, "CAD");
            const second = Money.create(100, "CAD");

            expect(first.equals(second)).toBe(true);
        });

        test("returns false when structured values differ", () => {
            const first = Money.create(100, "CAD");
            const second = Money.create(100, "USD");

            expect(first.equals(second)).toBe(false);
        });
    });
});