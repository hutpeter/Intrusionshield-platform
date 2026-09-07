/**
 * -------------------------------------------------------
 * IntrusionShield Enterprise Platform
 *
 * Base Value Object
 * -------------------------------------------------------
 */

function areEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
        return true;
    }

    if (
        typeof left !== "object" ||
        left === null ||
        typeof right !== "object" ||
        right === null
    ) {
        return false;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right)) {
            return false;
        }

        if (left.length !== right.length) {
            return false;
        }

        return left.every((value, index) =>
            areEqual(value, right[index])
        );
    }

    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;

    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);

    if (leftKeys.length !== rightKeys.length) {
        return false;
    }

    return leftKeys.every(
        (key) =>
            Object.prototype.hasOwnProperty.call(rightRecord, key) &&
            areEqual(leftRecord[key], rightRecord[key])
    );
}

export abstract class ValueObject<T> {
    protected constructor(
        protected readonly props: T
    ) {}

    public equals(other?: ValueObject<T>): boolean {
        if (!other) {
            return false;
        }

        return areEqual(this.props, other.props);
    }

    public get value(): T {
        return this.props;
    }
}