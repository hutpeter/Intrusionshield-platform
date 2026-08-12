/**
 * Defines a parameter supplied to a SQL statement.
 *
 * The database provider is responsible for translating the parameter
 * into the appropriate native database parameter representation.
 */
export interface SqlParameter {
    /**
     * Parameter name without the SQL parameter prefix.
     *
     * Example:
     *
     * SQL:
     *   WHERE UserId = @userId
     *
     * Parameter name:
     *   userId
     */
    name: string;

    /**
     * Parameter value.
     */
    value: unknown;

    /**
     * Optional provider-specific database parameter type.
     *
     * The value is intentionally typed as unknown at the platform
     * abstraction level so the core database contract does not depend
     * on a specific database driver.
     */
    type?: unknown;
}