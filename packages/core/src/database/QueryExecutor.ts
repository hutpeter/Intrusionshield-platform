import type { SqlParameter } from "./SqlParameter.js";
import type { SqlResult } from "./SqlResult.js";
import type { IDatabaseProvider } from "./providers/IDatabaseProvider.js";

/**
 * Executes database queries through the configured database provider.
 *
 * QueryExecutor deliberately depends only on the database provider
 * abstraction and does not depend on a specific database technology.
 */
export class QueryExecutor {
    public constructor(
        private readonly provider: IDatabaseProvider
    ) {}

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
        return this.provider.query<T>(
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
        return this.provider.execute(
            sql,
            parameters
        );
    }
}