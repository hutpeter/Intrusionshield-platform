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
});
