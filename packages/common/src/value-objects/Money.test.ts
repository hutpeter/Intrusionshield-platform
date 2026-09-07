import { describe, expect, test } from "@jest/globals";
import { Money } from "./money.js";

describe("Money", () => {
    test("creates money with a valid amount and currency", () => {
        const money = Money.create(100, "CAD");

        expect(money.amount).toBe(100);
        expect(money.currency).toBe("CAD");
    });

    test("normalizes lowercase currency codes", () => {
        const money = Money.create(100, "cad");

        expect(money.currency).toBe("CAD");
    });

    test("trims and normalizes currency codes", () => {
        const money = Money.create(100, " cad ");

        expect(money.currency).toBe("CAD");
    });

    test("rounds the amount to two decimal places", () => {
        const money = Money.create(10.456, "CAD");

        expect(money.amount).toBe(10.46);
    });

    test("accepts zero", () => {
        const money = Money.create(0, "CAD");

        expect(money.amount).toBe(0);
    });

    test("accepts negative amounts", () => {
        const money = Money.create(-25.5, "CAD");

        expect(money.amount).toBe(-25.5);
    });

    test("rejects NaN", () => {
        expect(() => Money.create(NaN, "CAD")).toThrow(
            "Money amount must be a finite number."
        );
    });

    test("rejects positive infinity", () => {
        expect(() => Money.create(Infinity, "CAD")).toThrow(
            "Money amount must be a finite number."
        );
    });

    test("rejects negative infinity", () => {
        expect(() => Money.create(-Infinity, "CAD")).toThrow(
            "Money amount must be a finite number."
        );
    });

    test("rejects a currency that is not three letters", () => {
        expect(() => Money.create(100, "CA")).toThrow(
            "Currency must be a three-letter ISO currency code."
        );
    });

    test("rejects numeric currency codes", () => {
        expect(() => Money.create(100, "123")).toThrow(
            "Currency must be a three-letter ISO currency code."
        );
    });

    test("rejects an empty currency", () => {
        expect(() => Money.create(100, "")).toThrow(
            "Currency must be a three-letter ISO currency code."
        );
    });

    test("formats the money value with two decimal places", () => {
        const money = Money.create(25, "CAD");

        expect(money.toString()).toBe("CAD 25.00");
    });

    test("compares equal money values as equal value objects", () => {
        const first = Money.create(100, "CAD");
        const second = Money.create(100, "CAD");

        expect(first.equals(second)).toBe(true);
    });

    test("compares different money values as unequal", () => {
        const first = Money.create(100, "CAD");
        const second = Money.create(100, "USD");

        expect(first.equals(second)).toBe(false);
    });
});