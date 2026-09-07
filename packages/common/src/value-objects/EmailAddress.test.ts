import { describe, expect, test } from "@jest/globals";
import { EmailAddress } from "./EmailAddress.js";

describe("EmailAddress", () => {
    test("creates a normalized email address", () => {
        const email = EmailAddress.create("  USER@Example.COM  ");

        expect(email.toString()).toBe("user@example.com");
        expect(email.value).toBe("user@example.com");
    });

    test("accepts a valid email address", () => {
        expect(() => EmailAddress.create("user@example.com")).not.toThrow();
    });

    test("rejects an empty email address", () => {
        expect(() => EmailAddress.create("")).toThrow(
            "Invalid email address."
        );
    });

    test("rejects whitespace-only input", () => {
        expect(() => EmailAddress.create("   ")).toThrow(
            "Invalid email address."
        );
    });

    test("rejects an email without an at sign", () => {
        expect(() => EmailAddress.create("user.example.com")).toThrow(
            "Invalid email address."
        );
    });

    test("rejects an email without a domain", () => {
        expect(() => EmailAddress.create("user@")).toThrow(
            "Invalid email address."
        );
    });

    test("rejects an email without a domain suffix", () => {
        expect(() => EmailAddress.create("user@example")).toThrow(
            "Invalid email address."
        );
    });

    test("rejects an email containing whitespace", () => {
        expect(() => EmailAddress.create("user name@example.com")).toThrow(
            "Invalid email address."
        );
    });

    test("rejects an email longer than 254 characters", () => {
        const localPart = "a".repeat(243);
        const email = `${localPart}@example.com`;

        expect(email.length).toBeGreaterThan(254);

        expect(() => EmailAddress.create(email)).toThrow(
            "Invalid email address."
        );
    });

    test("compares equal email addresses as equal value objects", () => {
        const first = EmailAddress.create("USER@example.com");
        const second = EmailAddress.create("user@example.com");

        expect(first.equals(second)).toBe(true);
    });

    test("returns the email address from toString", () => {
        const email = EmailAddress.create("user@example.com");

        expect(email.toString()).toBe("user@example.com");
    });
});