/**
 * Represents the lifecycle contract for a database context.
 *
 * The database context is responsible for establishing and
 * releasing the underlying database connection.
 */
export interface IDatabaseContext {

    /**
     * Establishes the database connection.
     */
    connect(): Promise<void>;

    /**
     * Closes the database connection.
     */
    close(): Promise<void>;

    /**
     * Indicates whether the database is currently connected.
     */
    isConnected(): boolean;
}