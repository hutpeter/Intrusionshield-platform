/**
 * Standard result returned by the platform database abstraction.
 */
export interface SqlResult<T> {
    rows: T[];
    rowCount: number;
}
