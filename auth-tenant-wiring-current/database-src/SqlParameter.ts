/**
 * Represents a parameter supplied to a SQL statement.
 *
 * The optional type is deliberately opaque to the database abstraction;
 * concrete providers may translate or cast it to their driver's type.
 */
export interface SqlParameter {
    name: string;
    value: unknown;
    type?: unknown;
}
