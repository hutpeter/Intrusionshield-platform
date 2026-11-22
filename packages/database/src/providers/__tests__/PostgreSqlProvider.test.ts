import { describe, expect, test } from "@jest/globals";
import { PostgreSqlProvider } from "../PostgreSqlProvider.js";

type FakeClient = {
    query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
    release: () => void;
};

function makeProvider() {
    const statements: string[] = [];
    let released = 0;
    const client: FakeClient = {
        async query(sql) {
            statements.push(sql);
            return { rows: [{ ok: true }], rowCount: 1 };
        },
        release() { released++; }
    };
    const provider = new PostgreSqlProvider({ host: "localhost", port: 5432, database: "test", user: "test", password: "test" });
    // Isolated fake connection pool; no external PostgreSQL server required.
    (provider as unknown as { pool: { connect: () => Promise<FakeClient> } }).pool = {
        async connect() { return client; }
    };
    return { provider, statements, get released() { return released; } };
}

describe("PostgreSQL scoped transactions", () => {
    test("commits and releases a successful transaction", async () => {
        const testDb = makeProvider();
        const value = await testDb.provider.withTransaction(async db => {
            const result = await db.query<{ ok: boolean }>("SELECT 1");
            return result.rows[0]?.ok;
        });
        expect(value).toBe(true);
        expect(testDb.statements).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
        expect(testDb.released).toBe(1);
    });

    test("rolls back and releases a failed transaction", async () => {
        const testDb = makeProvider();
        await expect(testDb.provider.withTransaction(async db => {
            await db.execute("UPDATE things SET value = 1");
            throw new Error("business failure");
        })).rejects.toThrow("business failure");
        expect(testDb.statements).toEqual(["BEGIN", "UPDATE things SET value = 1", "ROLLBACK"]);
        expect(testDb.released).toBe(1);
    });

    test("rejects nested scoped transactions", async () => {
        const testDb = makeProvider();
        await testDb.provider.withTransaction(async db => {
            await expect(db.withTransaction(async () => undefined)).rejects.toThrow("Nested transactions are not supported.");
        });
        expect(testDb.statements).toEqual(["BEGIN", "COMMIT"]);
    });
    test("rejects queries from a stale asynchronous transaction context", async () => {
        const testDb = makeProvider();
        let releaseLateQuery!: () => void;
        const gate = new Promise<void>(resolve => { releaseLateQuery = resolve; });
        let lateQuery!: Promise<unknown>;
        await testDb.provider.withTransaction(async db => {
            lateQuery = gate.then(() => db.query("SELECT 2"));
        });
        releaseLateQuery();
        await expect(lateQuery).rejects.toThrow("Scoped database transaction has already completed.");
        expect(testDb.statements).toEqual(["BEGIN", "COMMIT"]);
        expect(testDb.released).toBe(1);
    });

    test("concurrent transactions use separate clients and commit independently", async () => {
        const provider = new PostgreSqlProvider({ host: "localhost", port: 5432, database: "test", user: "test", password: "test" });
        const calls: string[] = [];
        let nextClient = 0;
        const releases: number[] = [];
        (provider as unknown as { pool: { connect: () => Promise<FakeClient> } }).pool = {
            async connect() {
                const id = ++nextClient;
                return {
                    async query(sql: string) {
                        calls.push(`${id}:${sql}`);
                        return { rows: [{ clientId: id }], rowCount: 1 };
                    },
                    release() { releases.push(id); }
                };
            }
        };
        let releaseFirst!: () => void;
        const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
        let notifyFirst!: () => void;
        const firstStarted = new Promise<void>(resolve => { notifyFirst = resolve; });
        const first = provider.withTransaction(async db => {
            const result = await db.query<{ clientId: number }>("SELECT first");
            notifyFirst();
            await firstGate;
            return result.rows[0]?.clientId;
        });
        await firstStarted;
        const second = await provider.withTransaction(async db => {
            const result = await db.query<{ clientId: number }>("SELECT second");
            return result.rows[0]?.clientId;
        });
        releaseFirst();
        expect(await first).toBe(1);
        expect(second).toBe(2);
        expect(calls).toContain("1:SELECT first");
        expect(calls).toContain("2:SELECT second");
        expect(calls).toContain("1:COMMIT");
        expect(calls).toContain("2:COMMIT");
        expect(releases.sort()).toEqual([1, 2]);
    });

});
