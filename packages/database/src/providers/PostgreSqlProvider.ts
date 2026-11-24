import { Pool, type PoolClient } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";
import { normalizeDatabaseValue } from "../Uuid.js";
import type { IDatabaseProvider, ITenantScopedDatabaseProvider } from "./IDatabaseProvider.js";

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
export class PostgreSqlProvider implements ITenantScopedDatabaseProvider {
    private pool: Pool | null = null;
    private client: PoolClient | null = null;
    private readonly transactionContext = new AsyncLocalStorage<PoolClient>();
    private activeScopedTransactions = 0;
    private readonly scopedClients = new Set<PoolClient>();

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
        if (this.activeScopedTransactions > 0) {
            throw new Error("Cannot disconnect while scoped transactions are active.");
        }
        if (this.pool) {
            const pool = this.pool;
            this.pool = null;
            await pool.end();
        }
    }

    async query<T>(sql: string, parameters: SqlParameter[] = []): Promise<SqlResult<T>> {
        const values = parameters.map(p => p.value);
        const scopedClient = this.transactionContext.getStore();
        if (scopedClient && !this.scopedClients.has(scopedClient)) {
            throw new Error("Scoped database transaction has already completed.");
        }
        const activeClient = scopedClient ?? this.client;
        if (this.client && !scopedClient && this.transactionContext.getStore() !== this.client) {
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

    /** Run one unit of work on its own transaction connection, isolated from other requests. */
    async withTransaction<T>(work: (provider: PostgreSqlProvider) => Promise<T>): Promise<T> {
        if (this.client) throw new Error("Cannot start a scoped transaction while a legacy transaction is active.");
        if (this.transactionContext.getStore()) throw new Error("Nested transactions are not supported.");
        const client = await this.requirePool().connect();
        this.activeScopedTransactions++;
        this.scopedClients.add(client);
        try {
            await client.query("BEGIN");
            return await this.transactionContext.run(client, async () => {
                try {
                    const result = await work(this);
                    await client.query("COMMIT");
                    return result;
                } catch (error) {
                    try { await client.query("ROLLBACK"); }
                    catch (rollbackError) { throw new AggregateError([error, rollbackError], "Transaction and rollback failed."); }
                    throw error;
                }
            });
        } finally {
            this.scopedClients.delete(client);
            this.activeScopedTransactions--;
            client.release();
        }
    }

    /**
     * Run tenant-scoped work in one transaction. The tenant identifier is set with
     * transaction-local scope so pooled connections cannot leak it to later requests.
     * Tenant-owned tables must have an appropriate RLS policy; this method alone
     * does not authorize access or enforce isolation on tables without RLS.
     */
    async withTenantTransaction<T>(tenantId: string, work: (provider: IDatabaseProvider) => Promise<T>): Promise<T> {
        if (!tenantId || !tenantId.trim()) throw new Error("A non-empty tenant identifier is required.");
        return this.withTransaction(async provider => {
            await provider.query("SELECT set_config('ruby.tenant_id', $1, true)", [{ name: "tenantId", value: tenantId }]);
            return work(provider);
        });
    }

    async beginTransaction(): Promise<void> {
        if (this.client || this.activeScopedTransactions > 0) throw new Error("A database transaction is already active.");
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
