
import sql from "mssql";

import type { DatabaseOptions } from "../DatabaseOptions.js";
import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";
import type { IDatabaseProvider } from "./IDatabaseProvider.js";

/**
 * SQL Server implementation of the database provider contract.
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

        this.pool = await sql.connect({
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

        if (this.pool) {
            await this.pool.close();
            this.pool = null;
        }
    }

    /**
     * Executes a parameterized SQL query.
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
     * Begins a transaction.
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

        await this.transaction.begin();
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

        this.transaction = null;

        await transaction.commit();
    }

    /**
     * Rolls back the current transaction.
     */
    public async rollbackTransaction(): Promise<void> {
        if (!this.transaction) {
            return;
        }

        const transaction = this.transaction;

        this.transaction = null;

        await transaction.rollback();
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
     */
    private bindParameters(
        request: sql.Request,
        parameters: SqlParameter[]
    ): void {
        for (const parameter of parameters) {
            if (parameter.type) {
                request.input(
                    parameter.name,
                    parameter.type,
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
```
