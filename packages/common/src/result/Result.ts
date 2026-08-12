/**
 * -------------------------------------------------------
 * IntrusionShield Enterprise Platform
 *
 * Result Pattern
 * -------------------------------------------------------
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

    public static success<T>(value?: T): Result<T> {

        return new Result<T>(true, value);

    }

    public static failure<T>(message: string): Result<T> {

        return new Result<T>(false, undefined, message);

    }

    public ensure(): T {

        if (!this.isSuccess) {

            throw new Error(this.error);

        }

        return this.value as T;

    }

}