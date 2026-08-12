/**
 * -------------------------------------------------------
 * IntrusionShield Enterprise Platform
 *
 * Base Value Object
 * -------------------------------------------------------
 */

export abstract class ValueObject<T> {

    protected constructor(
        protected readonly props: T
    ) {}

    public equals(other?: ValueObject<T>): boolean {

        if (!other) {
            return false;
        }

        return JSON.stringify(this.props) === JSON.stringify(other.props);

    }

    public get value(): T {

        return this.props;

    }

}
