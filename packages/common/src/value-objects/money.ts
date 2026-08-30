import { ValueObject } from "./ValueObject.js";

export class Money extends ValueObject<{ amount: number; currency: string }> {
    private constructor(amount: number, currency: string) {
        super({ amount, currency });
    }

    public static create(amount: number, currency: string): Money {
        if (!Number.isFinite(amount)) {
            throw new Error("Money amount must be a finite number.");
        }
        if (!/^[A-Z]{3}$/.test(currency)) {
            throw new Error("Currency must be a three-letter ISO currency code.");
        }
        return new Money(Math.round(amount * 100) / 100, currency);
    }

    public get amount(): number {
        return this.value.amount;
    }

    public get currency(): string {
        return this.value.currency;
    }

    public toString(): string {
        return `${this.currency} ${this.amount.toFixed(2)}`;
    }
}
