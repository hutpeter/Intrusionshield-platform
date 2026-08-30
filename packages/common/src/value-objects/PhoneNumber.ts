import { ValueObject } from "./ValueObject.js";

export class PhoneNumber extends ValueObject<string> {
    private constructor(value: string) {
        super(value);
    }

    public static create(value: string): PhoneNumber {
        const phone = value?.trim();
        if (!phone || !/^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s().-]/g, ""))) {
            throw new Error("Invalid phone number.");
        }
        return new PhoneNumber(phone);
    }

    public toString(): string {
        return this.value;
    }
}
