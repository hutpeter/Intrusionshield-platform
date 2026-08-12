import type { SqlParameter } from "./SqlParameter.js";
import type { SqlResult } from "./SqlResult.js";
import type { IDatabaseProvider } from "./providers/IDatabaseProvider.js";
import { QueryExecutor } from "./QueryExecutor.js";

/**
 * Provides the high-level database API used by the platform.
 *
 * DatabaseManager coordinates connection lifecycle, query execution,
 * and transaction management while remaining independent of the
 * underlying database technology.
 */
export class DatabaseManager {
    private readonly executor: QueryExecutor;

    public constructor(
        private readonly provider: IDatabaseProvider
    ) {
        this.executor = new QueryExecutor(provider);
    }

    /**
     * Establishes the database connection.
     */
    public async connect(): Promise<void> {
        await this.provider.connect();
    }

    /**
     * Closes the database connection.
     */
    public async disconnect(): Promise<void> {
        await this.provider.disconnect();
    }

    /**
     * Executes a parameterized SQL query.
     *
     * @param sql SQL statement to execute.
     * @param parameters Optional query parameters.
     */
    public async query<T>(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {
        return this.executor.query<T>(
            sql,
            parameters
        );
    }

    /**
     * Executes a parameterized SQL command.
     *
     * @param sql SQL statement to execute.
     * @param parameters Optional query parameters.
     * @returns Number of rows affected.
     */
    public async execute(
        sql: string,
        parameters: SqlParameter[] = []
    ): Promise<number> {
        return this.executor.execute(
            sql,
            parameters
        );
    }

    /**
     * Begins a database transaction.
     */
    public async beginTransaction(): Promise<void> {
        await this.provider.beginTransaction();
    }

    /**
     * Commits the current database transaction.
     */
    public async commitTransaction(): Promise<void> {
        await this.provider.commitTransaction();
    }

    /**
     * Rolls back the current database transaction.
     */
    public async rollbackTransaction(): Promise<void> {
        await this.provider.rollbackTransaction();
    }

    /**
     * Indicates whether the database is currently connected.
     */
    public isConnected(): boolean {
        return this.provider.isConnected();
    }
}