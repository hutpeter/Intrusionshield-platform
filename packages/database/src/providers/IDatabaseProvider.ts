import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";

/**
 * Defines the contract implemented by database providers.
 *
 * A provider is responsible for translating the platform's
 * database abstraction into a specific database technology.
 */
export interface IDatabaseProvider {
    /** Establishes a database connection. */
    connect(): Promise<void>;

    /** Closes the database connection. */
    disconnect(): Promise<void>;

    /** Executes a SQL query and returns the resulting rows. */
    query<T>(
        sql: string,
        parameters?: SqlParameter[]
    ): Promise<SqlResult<T>>;

    /** Executes a SQL command that does not return a result set. */
    execute(
        sql: string,
        parameters?: SqlParameter[]
    ): Promise<number>;

    /** Begins a database transaction. */
    beginTransaction(): Promise<void>;

    /** Commits the current database transaction. */
    commitTransaction(): Promise<void>;

    /** Rolls back the current database transaction. */
    rollbackTransaction(): Promise<void>;

    /** Indicates whether the provider currently has an active connection. */
    isConnected(): boolean;
}
