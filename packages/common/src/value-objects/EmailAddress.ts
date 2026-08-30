import { ValueObject } from "./ValueObject.js";

export class EmailAddress extends ValueObject<string> {
    private constructor(email: string) {
        super(email);
    }

    public static create(value: string): EmailAddress {
        const email = value?.trim().toLowerCase();
        if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error("Invalid email address.");
        }
        return new EmailAddress(email);
    }

    public toString(): string {
        return this.value;
    }
}
