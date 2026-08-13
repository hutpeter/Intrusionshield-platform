/**
 * IntrusionShield Enterprise Platform
 *
 * Result pattern for explicit success/failure outcomes.
 */
export class Result<T> {
    private constructor(
        public readonly isSuccess: boolean,
        public readonly value?: T,
        public readonly error?: string
    ) {}

    public get isFailure(): boolean {
        return !this.isSuccess;
    }

    public static success<T>(value: T): Result<T> {
        return new Result<T>(true, value);
    }

    public static successVoid(): Result<void> {
        return new Result<void>(true);
    }

    public static failure<T = never>(message: string): Result<T> {
        if (!message.trim()) {
            throw new Error("A Result failure requires an error message.");
        }

        return new Result<T>(false, undefined, message);
    }

    public ensure(): T {
        if (this.isFailure) {
            throw new Error(this.error ?? "Result operation failed.");
        }

        return this.value as T;
    }
}
