import { describe, expect, test } from "@jest/globals";
import { PhoneNumber } from "./PhoneNumber.js";

describe("PhoneNumber", () => {
    test("creates a valid phone number", () => {
        const phone = PhoneNumber.create("+14165551234");

        expect(phone.value).toBe("+14165551234");
    });

    test("accepts a phone number without a plus sign", () => {
        const phone = PhoneNumber.create("14165551234");

        expect(phone.value).toBe("14165551234");
    });

    test("trims surrounding whitespace", () => {
        const phone = PhoneNumber.create("  +14165551234  ");

        expect(phone.value).toBe("+14165551234");
    });

    test("accepts common formatting characters", () => {
        const phone = PhoneNumber.create("+1 (416) 555-1234");

        expect(phone.value).toBe("+1 (416) 555-1234");
    });

    test("rejects an empty phone number", () => {
        expect(() => PhoneNumber.create("")).toThrow(
            "Invalid phone number."
        );
    });

    test("rejects whitespace-only input", () => {
        expect(() => PhoneNumber.create("   ")).toThrow(
            "Invalid phone number."
        );
    });

    test("rejects a phone number that is too short", () => {
        expect(() => PhoneNumber.create("1234567")).toThrow(
            "Invalid phone number."
        );
    });

    test("rejects a phone number that is too long", () => {
        expect(() => PhoneNumber.create("1234567890123456")).toThrow(
            "Invalid phone number."
        );
    });

    test("rejects a phone number beginning with zero", () => {
        expect(() => PhoneNumber.create("0123456789")).toThrow(
            "Invalid phone number."
        );
    });

    test("rejects alphabetic characters", () => {
        expect(() => PhoneNumber.create("+1416555ABCD")).toThrow(
            "Invalid phone number."
        );
    });

    test("returns the phone number from toString", () => {
        const phone = PhoneNumber.create("+14165551234");

        expect(phone.toString()).toBe("+14165551234");
    });

    test("compares equal phone numbers as equal value objects", () => {
        const first = PhoneNumber.create("+14165551234");
        const second = PhoneNumber.create("+14165551234");

        expect(first.equals(second)).toBe(true);
    });

    test("compares different phone numbers as unequal", () => {
        const first = PhoneNumber.create("+14165551234");
        const second = PhoneNumber.create("+14165551235");

        expect(first.equals(second)).toBe(false);
    });
});