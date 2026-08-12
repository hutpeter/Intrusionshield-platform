import sql from "mssql";

import type { DatabaseOptions } from "../DatabaseOptions.js";
import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";
import type { IDatabaseProvider } from "./IDatabaseProvider.js";

/**
 * SQL Server implementation of the database provider contract.
 *
 * The provider owns its connection pool rather than using mssql's
 * process-global pool. This allows multiple DatabaseManager/provider
 * instances to safely target different databases or tenants.
 */
export class SqlServerProvider implements IDatabaseProvider {
    private pool: sql.ConnectionPool | null = null;

    private transaction: sql.Transaction | null = null;

    public constructor(
        private readonly options: DatabaseOptions
    ) {}

    /**
     * Establishes the SQL Server connection.
     */
    public async connect(): Promise<void> {
        if (this.pool?.connected) {
            return;
        }

        const pool = new sql.ConnectionPool({
            server: this.options.server,
            port: this.options.port,
            database: this.options.database,
            user: this.options.user,
            password: this.options.password,
            options: {
                encrypt: this.options.encrypt,
                trustServerCertificate:
                    this.options.trustServerCertificate
            }
        });

        try {
            await pool.connect();
            this.pool = pool;
        } catch (error) {
            await pool.close().catch(() => undefined);
            throw error;
        }
    }

    /**
     * Closes the SQL Server connection.
     */
    public async disconnect(): Promise<void> {
        if (this.transaction) {
            try {
                await this.transaction.rollback();
            } catch {
                // Ignore rollback failures while disconnecting.
            }

            this.transaction = null;
        }

        const pool = this.pool;
        this.pool = null;

        if (pool) {
            await pool.close();
        }
    }

    /**
     * Executes a parameterized SQL query.
     *
     * @param sqlText SQL statement to execute.
     * @param parameters Optional query parameters.
     */
    public async query<T>(
        sqlText: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {
        const request = await this.createRequest();

        this.bindParameters(request, parameters);

        const result = await request.query<T>(sqlText);

        return {
            rows: result.recordset ?? [],
            rowCount:
                result.rowsAffected?.reduce(
                    (total, count) => total + count,
                    0
                ) ?? 0
        };
    }

    /**
     * Executes a parameterized SQL command.
     *
     * @param sqlText SQL statement to execute.
     * @param parameters Optional query parameters.
     * @returns Number of rows affected.
     */
    public async execute(
        sqlText: string,
        parameters: SqlParameter[] = []
    ): Promise<number> {
        const request = await this.createRequest();

        this.bindParameters(request, parameters);

        const result = await request.query(sqlText);

        return (
            result.rowsAffected?.reduce(
                (total, count) => total + count,
                0
            ) ?? 0
        );
    }

    /**
     * Begins a database transaction.
     */
    public async beginTransaction(): Promise<void> {
        if (!this.pool) {
            throw new Error(
                "Cannot begin a transaction before connecting to the database."
            );
        }

        if (this.transaction) {
            throw new Error(
                "A database transaction is already active."
            );
        }

        this.transaction = new sql.Transaction(this.pool);

        try {
            await this.transaction.begin();
        } catch (error) {
            this.transaction = null;
            throw error;
        }
    }

    /**
     * Commits the current transaction.
     */
    public async commitTransaction(): Promise<void> {
        if (!this.transaction) {
            throw new Error(
                "Cannot commit because no database transaction is active."
            );
        }

        const transaction = this.transaction;

        try {
            await transaction.commit();
        } finally {
            this.transaction = null;
        }
    }

    /**
     * Rolls back the current transaction.
     */
    public async rollbackTransaction(): Promise<void> {
        if (!this.transaction) {
            return;
        }

        const transaction = this.transaction;

        try {
            await transaction.rollback();
        } finally {
            this.transaction = null;
        }
    }

    /**
     * Indicates whether the provider is connected.
     */
    public isConnected(): boolean {
        return this.pool?.connected === true;
    }

    /**
     * Creates a SQL request using either the active transaction
     * or the connection pool.
     */
    private async createRequest(): Promise<sql.Request> {
        if (this.transaction) {
            return new sql.Request(this.transaction);
        }

        if (!this.pool) {
            throw new Error(
                "Database connection has not been established."
            );
        }

        return this.pool.request();
    }

    /**
     * Binds platform SQL parameters to a SQL Server request.
     *
     * The generic SqlParameter abstraction intentionally does not
     * depend on mssql. The SQL Server provider performs the
     * provider-specific type conversion at this boundary.
     */
    private bindParameters(
        request: sql.Request,
        parameters: SqlParameter[]
    ): void {
        for (const parameter of parameters) {
            if (parameter.type !== undefined) {
                request.input(
                    parameter.name,
                    parameter.type as
                        | sql.ISqlType
                        | (() => sql.ISqlType),
                    parameter.value
                );
            } else {
                request.input(
                    parameter.name,
                    parameter.value
                );
            }
        }
    }
}
