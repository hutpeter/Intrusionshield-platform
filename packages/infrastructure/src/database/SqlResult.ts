export interface SqlResult<T = unknown> {
    rows: T[];
    rowsAffected: number;
    output?: Record<string, unknown>;
}