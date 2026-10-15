import { randomUUID } from "node:crypto";

/**
 * Canonical UUID format used throughout the platform.
 *
 * UUIDs are represented as lowercase RFC 4122 strings.
 */
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Determines whether a value is a valid UUID string.
 */
export function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Converts a UUID into the platform's canonical lowercase representation.
 *
 * Non-UUID values are returned unchanged.
 */
export function normalizeUuid<T>(value: T): T {
    if (!isUuid(value)) {
        return value;
    }

    return value.toLowerCase() as T;
}

/**
 * Generates a new platform UUID.
 *
 * UUID generation is centralized in the database package so infrastructure
 * code does not need to depend directly on a database-specific UUID
 * generation function such as SQL Server NEWID().
 */
export function createUuid(): string {
    return randomUUID().toLowerCase();
}

/**
 * Recursively normalizes UUID strings contained in database result values.
 *
 * SQL Server may return uniqueidentifier values using uppercase hexadecimal
 * characters. The database boundary is responsible for converting those
 * values to the platform's canonical lowercase representation.
 *
 * Arrays and plain objects are copied rather than mutated.
 *
 * Special JavaScript values such as Date instances are preserved unchanged.
 */
export function normalizeDatabaseValue<T>(value: T): T {
    if (isUuid(value)) {
        return value.toLowerCase() as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) =>
            normalizeDatabaseValue(item)
        ) as T;
    }

    if (value instanceof Date) {
        return value;
    }

    if (value !== null && typeof value === "object") {
        const prototype = Object.getPrototypeOf(value);

        if (prototype !== Object.prototype && prototype !== null) {
            return value;
        }

        const normalized: Record<string, unknown> = {};

        for (const [key, item] of Object.entries(
            value as Record<string, unknown>
        )) {
            normalized[key] = normalizeDatabaseValue(item);
        }

        return normalized as T;
    }

    return value;
}