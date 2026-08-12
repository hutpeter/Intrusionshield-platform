import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";

export interface IDatabaseProvider {

    /**
     * Establishes a database connection.
     */
    connect(): Promise<void>;

    /**
     * Closes the database connection.
     */
    disconnect(): Promise<void>;

    /**
     * Executes a SQL query and returns the resulting rows.
     *
     * @param sql SQL statement to execute.
     * @param parameters Optional query parameters.
     */
    query<T>(
        sql: string,
        parameters?: SqlParameter[]
    ): Promise<SqlResult<T>>;

    /**
     * Executes a SQL command that does not primarily return rows.
     *
     * @param sql SQL statement to execute.
     * @param parameters Optional query parameters.
     */
    execute(
        sql: string,
        parameters?: SqlParameter[]
    ): Promise<SqlResult>;

    /**
     * Indicates whether the provider currently has an
     * active database connection.
     */
    isConnected(): boolean;
}