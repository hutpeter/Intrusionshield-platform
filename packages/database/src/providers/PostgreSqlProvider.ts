import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";
import { normalizeDatabaseValue } from "../Uuid.js";
import type { IDatabaseProvider } from "./IDatabaseProvider.js";

/** PostgreSQL-specific options; TLS is validated by the deployment configuration. */
export interface PostgreSqlOptions {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
}

/** Connection/transaction boundary for PostgreSQL. Never share an active transaction across requests. */
export class PostgreSqlProvider implements IDatabaseProvider {
    private pool: Pool | null = null;
    private client: PoolClient | null = null;
    private readonly transactionContext = new AsyncLocalStorage<PoolClient>();

    constructor(private readonly options: PostgreSqlOptions) {}

    async connect(): Promise<void> {
        if (this.pool) return;
        const pool = new Pool(this.options);
        try {
            const client = await pool.connect();
            client.release();
            this.pool = pool;
        } catch (error) {
            await pool.end();
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            const client = this.client;
            this.client = null;
            try { await client.query("ROLLBACK"); } finally { client.release(); }
        }
        if (this.pool) {
            const pool = this.pool;
            this.pool = null;
            await pool.end();
        }
    }

    async query<T>(sql: string, parameters: SqlParameter[] = []): Promise<SqlResult<T>> {
        const values = parameters.map(p => p.value);
        const activeClient = this.client;
        if (activeClient && this.transactionContext.getStore() !== activeClient) {
            throw new Error("Database transaction belongs to another asynchronous context.");
        }
        const result = activeClient
            ? await activeClient.query(sql, values)
            : await this.requirePool().query(sql, values);
        return { rows: normalizeDatabaseValue(result.rows) as T[], rowCount: result.rowCount ?? 0 };
    }

    async execute(sql: string, parameters: SqlParameter[] = []): Promise<number> {
        const result = await this.query(sql, parameters);
        return result.rowCount;
    }

    async beginTransaction(): Promise<void> {
        if (this.client) throw new Error("A database transaction is already active.");
        const client = await this.requirePool().connect();
        try {
            await client.query("BEGIN");
            this.client = client;
            this.transactionContext.enterWith(client);
        } catch (error) {
            client.release();
            throw error;
        }
    }

    async commitTransaction(): Promise<void> {
        if (!this.client) throw new Error("No active database transaction.");
        const client = this.client;
        if (this.transactionContext.getStore() !== client) throw new Error("Database transaction belongs to another asynchronous context.");
        try { await client.query("COMMIT"); }
        finally { this.client = null; client.release(); }
    }

    async rollbackTransaction(): Promise<void> {
        if (!this.client) return;
        const client = this.client;
        if (this.transactionContext.getStore() !== client) throw new Error("Database transaction belongs to another asynchronous context.");
        try { await client.query("ROLLBACK"); }
        finally { this.client = null; client.release(); }
    }

    isConnected(): boolean { return this.pool !== null; }

    private requirePool(): Pool {
        if (!this.pool) throw new Error("Database connection has not been established.");
        return this.pool;
    }
}
