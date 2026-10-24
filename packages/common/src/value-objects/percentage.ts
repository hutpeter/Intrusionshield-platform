export class Percentage {
    private constructor(
        public readonly value: number
    ) {}

    public static create(value: number): Percentage {
        if (
            !Number.isFinite(value) ||
            value < 0 ||
            value > 100
        ) {
            throw new Error(
                "Percentage must be between 0 and 100."
            );
        }

        return new Percentage(value);
    }

    public toDecimal(): number {
        return this.value / 100;
    }

    public toString(): string {
        return `${this.value}%`;
    }

public equals(other: Percentage | undefined | null): boolean {
    if (other == null) {
        return false;
    }

    return this.value === other.value;
}
}