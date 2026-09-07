import { describe, expect, test } from "@jest/globals";
import { Percentage } from "./percentage.js";

describe("Percentage", () => {
    test("creates a percentage with a valid value", () => {
        const percentage = Percentage.create(25);

        expect(percentage.value).toBe(25);
    });

    test("accepts zero percent", () => {
        const percentage = Percentage.create(0);

        expect(percentage.value).toBe(0);
    });

    test("accepts 100 percent", () => {
        const percentage = Percentage.create(100);

        expect(percentage.value).toBe(100);
    });

    test("rejects values below zero", () => {
        expect(() => Percentage.create(-1)).toThrow(
            "Percentage must be between 0 and 100."
        );
    });

    test("rejects values above 100", () => {
        expect(() => Percentage.create(101)).toThrow(
            "Percentage must be between 0 and 100."
        );
    });

    test("rejects NaN", () => {
        expect(() => Percentage.create(NaN)).toThrow(
            "Percentage must be between 0 and 100."
        );
    });

    test("rejects positive infinity", () => {
        expect(() => Percentage.create(Infinity)).toThrow(
            "Percentage must be between 0 and 100."
        );
    });

    test("rejects negative infinity", () => {
        expect(() => Percentage.create(-Infinity)).toThrow(
            "Percentage must be between 0 and 100."
        );
    });

    test("converts the percentage to a decimal", () => {
        expect(Percentage.create(25).toDecimal()).toBe(0.25);
        expect(Percentage.create(100).toDecimal()).toBe(1);
        expect(Percentage.create(0).toDecimal()).toBe(0);
    });

    test("formats the percentage as a string", () => {
        expect(Percentage.create(25).toString()).toBe("25%");
    });

    test("compares equal percentages as equal value objects", () => {
        const first = Percentage.create(25);
        const second = Percentage.create(25);

        expect(first.equals(second)).toBe(true);
    });

    test("compares different percentages as unequal", () => {
        const first = Percentage.create(25);
        const second = Percentage.create(50);

        expect(first.equals(second)).toBe(false);
    });
});