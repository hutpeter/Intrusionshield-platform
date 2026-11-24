import { describe, expect, test } from "@jest/globals";
import { TenantDatabaseAccess, type TenantDatabaseSession } from "../TenantDatabaseAccess.js";
import type { IDatabaseProvider, ITenantScopedDatabaseProvider } from "../IDatabaseProvider.js";

function fixture() {
    const calls: string[] = [];
    const tx = {
        query: async <T>(sql: string) => { calls.push(sql); return { rows: [] as T[], rowCount: 0 }; },
        execute: async (sql: string) => { calls.push(sql); return 1; }
    } as IDatabaseProvider;
    const provider = {
        withTenantTransaction: async <T>(tenant: string, work: (p: IDatabaseProvider) => Promise<T>) => {
            calls.push("tenant:" + tenant);
            return work(tx);
        }
    } as ITenantScopedDatabaseProvider;
    return { access: new TenantDatabaseAccess(provider), calls };
}

describe("tenant-only database facade", () => {
    test("rejects missing tenant before touching provider", async () => {
        const { access, calls } = fixture();
        await expect(access.forTenant(" ", async () => undefined)).rejects.toThrow("tenant identifier");
        expect(calls).toEqual([]);
    });
    test("only exposes queries inside tenant callback", async () => {
        const { access, calls } = fixture();
        let leaked!: TenantDatabaseSession;
        await access.forTenant("tenant-a", async session => {
            leaked = session;
            await session.query("SELECT 1");
            await session.execute("UPDATE items SET value=1");
            expect("connect" in session).toBe(false);
            expect("beginTransaction" in session).toBe(false);
        });
        expect(calls).toEqual(["tenant:tenant-a", "SELECT 1", "UPDATE items SET value=1"]);
        await expect(leaked.query("SELECT 2")).rejects.toThrow("already completed");
        await expect(leaked.execute("DELETE FROM items")).rejects.toThrow("already completed");
    });
    test("invalidates session after callback failure", async () => {
        const { access } = fixture();
        let leaked!: TenantDatabaseSession;
        await expect(access.forTenant("tenant-b", async session => {
            leaked = session;
            throw new Error("application failure");
        })).rejects.toThrow("application failure");
        await expect(leaked.query("SELECT 1")).rejects.toThrow("already completed");
    });
});
