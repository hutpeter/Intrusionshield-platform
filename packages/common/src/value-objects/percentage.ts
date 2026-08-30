import { ValueObject } from "./ValueObject.js";

export class Percentage extends ValueObject<number> {
    private constructor(value: number) {
        super(value);
    }

    public static create(value: number): Percentage {
        if (!Number.isFinite(value) || value < 0 || value > 100) {
            throw new Error("Percentage must be between 0 and 100.");
        }
        return new Percentage(value);
    }

    public toDecimal(): number {
        return this.value / 100;
    }

    public toString(): string {
        return `${this.value}%`;
    }
}
