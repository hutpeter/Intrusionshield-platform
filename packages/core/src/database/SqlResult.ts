/**
 * Represents the normalized result returned from a database query.
 *
 * The result is independent of the underlying database provider.
 */
export interface SqlResult<T> {
    /**
     * Rows returned by the query.
     */
    rows: T[];

    /**
     * Total number of rows affected or returned by the operation,
     * depending on the database provider and SQL statement.
     */
    rowCount: number;
}

