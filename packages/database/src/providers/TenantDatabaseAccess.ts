import type { SqlParameter } from "../SqlParameter.js";
import type { SqlResult } from "../SqlResult.js";
import type { IDatabaseProvider, ITenantScopedDatabaseProvider } from "./IDatabaseProvider.js";

/** Only tenant-bound operations are exposed to application code. */
export interface TenantDatabaseSession {
    query<T>(sql: string, parameters?: SqlParameter[]): Promise<SqlResult<T>>;
    execute(sql: string, parameters?: SqlParameter[]): Promise<number>;
}

/**
 * Enforces a tenant context at the application database boundary.
 * Callers cannot execute queries through this facade without a tenant-scoped
 * transaction. A session becomes unusable when its callback finishes.
 * Database RLS policies are still required to enforce isolation against SQL.
 */
export class TenantDatabaseAccess {
    constructor(private readonly provider: ITenantScopedDatabaseProvider) {}

    async forTenant<T>(tenantId: string, work: (session: TenantDatabaseSession) => Promise<T>): Promise<T> {
        if (!tenantId || !tenantId.trim()) throw new Error("A non-empty tenant identifier is required.");
        return this.provider.withTenantTransaction(tenantId, async (tx: IDatabaseProvider) => {
            let active = true;
            const ensureActive = () => {
                if (!active) throw new Error("Tenant database session has already completed.");
            };
            const session: TenantDatabaseSession = {
                query: async <R>(sql: string, parameters: SqlParameter[] = []) => {
                    ensureActive();
                    return tx.query<R>(sql, parameters);
                },
                execute: async (sql: string, parameters: SqlParameter[] = []) => {
                    ensureActive();
                    return tx.execute(sql, parameters);
                }
            };
            try { return await work(session); }
            finally { active = false; }
        });
    }
}
