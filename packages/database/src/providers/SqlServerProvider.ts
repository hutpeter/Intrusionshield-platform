import sql from "mssql";
import { AsyncLocalStorage } from "node:async_hooks";

import type { DatabaseOptions } from "../DatabaseOptions.js";
import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";
import { normalizeDatabaseValue } from "../Uuid.js";
import type { IDatabaseProvider } from "./IDatabaseProvider.js";

/**
 * SQL Server implementation of the database provider contract.
 *
 * SQL Server uniqueidentifier values may be returned using uppercase
 * hexadecimal characters. The database provider is the platform database
 * boundary, so all query results are normalized here before they enter
 * repositories or application code.
 */
export class SqlServerProvider implements IDatabaseProvider {
    private pool: sql.ConnectionPool | null = null;

    private transaction: sql.Transaction | null = null;
    private readonly scopedTransaction = new AsyncLocalStorage<sql.Transaction>();
    private readonly activeScopedTransactions = new Set<sql.Transaction>();

    public constructor(
        private readonly options: DatabaseOptions
    ) {}

    /** Establishes the SQL Server connection. */
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
    } catch (connectionError) {
        try {
            await pool.close();
        } catch (cleanupError) {
            throw new AggregateError(
                [connectionError, cleanupError],
                "SQL Server connection failed and pool cleanup also failed."
            );
        }

    throw connectionError;
}
    }

    /** Closes the SQL Server connection. */
    public async disconnect(): Promise<void> {
        if (this.activeScopedTransactions.size > 0) throw new Error("Cannot disconnect while scoped transactions are active.");
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
     *
     * Query results are normalized at the database boundary so UUID values
     * returned by SQL Server use the platform's canonical lowercase
     * representation before being exposed to repositories and services.
     */
    public async query<T>(
        sqlText: string,
        parameters: SqlParameter[] = []
    ): Promise<SqlResult<T>> {
        const request = await this.createRequest();

        this.bindParameters(request, parameters);

        const result = await request.query<T>(sqlText);

        const rows = normalizeDatabaseValue(
            result.recordset ?? []
        );

        return {
            rows,
            rowCount:
                result.rowsAffected?.reduce(
                    (total, count) => total + count,
                    0
                ) ?? 0
        };
    }

    /** Executes a parameterized SQL command. */
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

    /** Isolated per-request transaction; nested transactions are not supported. */
    public async withTransaction<T>(work: (provider: SqlServerProvider) => Promise<T>): Promise<T> {
        if (!this.pool) throw new Error("Database connection has not been established.");
        if (this.transaction || this.scopedTransaction.getStore()) throw new Error("Nested or mixed transactions are not supported.");
        const transaction = new sql.Transaction(this.pool);
        await transaction.begin();
        this.activeScopedTransactions.add(transaction);
        try {
            return await this.scopedTransaction.run(transaction, async () => {
                try {
                    const result = await work(this);
                    await transaction.commit();
                    return result;
                } catch (error) {
                    try { await transaction.rollback(); }
                    catch (rollbackError) { throw new AggregateError([error, rollbackError], "Transaction and rollback failed."); }
                    throw error;
                }
            });
        } finally { this.activeScopedTransactions.delete(transaction); }
    }

    /** SQL Server SESSION_CONTEXT is connection-scoped; clear it before releasing the transaction. */
    public async withTenantTransaction<T>(tenantId: string, work: (provider: SqlServerProvider) => Promise<T>): Promise<T> {
        if (!tenantId || !tenantId.trim()) throw new Error("A non-empty tenant identifier is required.");
        return this.withTransaction(async provider => {
            await provider.query("EXEC sys.sp_set_session_context @key=N'ruby.tenant_id', @value=@tenantId, @read_only=0", [
                { name: "tenantId", value: tenantId }
            ]);
            try { return await work(provider); }
            finally { await provider.query("EXEC sys.sp_set_session_context @key=N'ruby.tenant_id', @value=NULL, @read_only=0"); }
        });
    }

    /** Begins a transaction. */
    public async beginTransaction(): Promise<void> {
        if (!this.pool) {
            throw new Error(
                "Cannot begin a transaction before connecting to the database."
            );
        }

        if (this.transaction || this.activeScopedTransactions.size > 0) {
            throw new Error("A database transaction is already active.");
        }

        const transaction = new sql.Transaction(this.pool);

        await transaction.begin();

        this.transaction = transaction;
    }

    /** Commits the current transaction. */
    public async commitTransaction(): Promise<void> {
        if (!this.transaction) {
            throw new Error(
                "Cannot commit because no database transaction is active."
            );
        }

        const transaction = this.transaction;

        await transaction.commit();

        this.transaction = null;
    }

    /** Rolls back the current transaction. */
    public async rollbackTransaction(): Promise<void> {
        if (!this.transaction) {
            return;
        }

        const transaction = this.transaction;

        await transaction.rollback();

        this.transaction = null;
    }

    public isConnected(): boolean {
        return this.pool?.connected === true;
    }

    private async createRequest(): Promise<sql.Request> {
        const scoped = this.scopedTransaction.getStore();
        if (scoped) {
            if (!this.activeScopedTransactions.has(scoped)) throw new Error("Scoped database transaction has already completed.");
            return new sql.Request(scoped);
        }
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

    private bindParameters(
        request: sql.Request,
        parameters: SqlParameter[]
    ): void {
        for (const parameter of parameters) {
            if (parameter.type !== undefined) {
                request.input(
                    parameter.name,
                    parameter.type as Parameters<
                        sql.Request["input"]
                    >[1],
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