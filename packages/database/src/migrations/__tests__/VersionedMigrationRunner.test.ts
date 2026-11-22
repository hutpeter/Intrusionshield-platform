import { describe, expect, test } from "@jest/globals";
import { runVersionedMigrations, type MigrationHistoryStore } from "../VersionedMigrationRunner.js";
import { migrationChecksum, type AppliedMigrationRecord } from "../MigrationPlan.js";

const first = { id: "001", description: "first", sqlserver: "SELECT 1", postgresql: "SELECT 1::int" };
const second = { id: "002", description: "second", sqlserver: "SELECT 2", postgresql: "SELECT 2::int" };

function store(initial: AppliedMigrationRecord[] = []) {
    const history = [...initial];
    const executed: string[] = [];
    const events: string[] = [];
    let locked = false;
    const adapter: MigrationHistoryStore = {
        withExclusiveLock: async <T>(work: () => Promise<T>): Promise<T> => {
            if (locked) throw new Error("Lock already held");
            locked = true;
            events.push("lock");
            try { return await work(); }
            finally { locked = false; events.push("unlock"); }
        },
        readApplied: async () => { if (!locked) throw new Error("History read without lock"); return [...history]; },
        applyAndRecord: async (migration, sql, checksum) => {
            if (!locked) throw new Error("Migration applied without lock");
            executed.push(sql);
            history.push({ id: migration.id, checksum });
        }
    };
    return { adapter, executed, history, events };
}

describe("versioned migration orchestration", () => {
    test("applies pending migrations and skips them on second run", async () => {
        const { adapter, executed, events } = store();
        expect(await runVersionedMigrations("postgresql", [first, second], adapter)).toEqual(["001", "002"]);
        expect(await runVersionedMigrations("postgresql", [first, second], adapter)).toEqual([]);
        expect(executed).toEqual([first.postgresql, second.postgresql]);
        expect(events).toEqual(["lock", "unlock", "lock", "unlock"]);
    });
    test("detects drift before executing pending work", async () => {
        const { adapter, executed } = store([{ id: "001", checksum: "0".repeat(64) }]);
        await expect(runVersionedMigrations("sqlserver", [first, second], adapter)).rejects.toThrow("checksum drift");
        expect(executed).toEqual([]);
    });
    test("preserves history when a migration fails before recording", async () => {
        const { adapter, history, events } = store();
        const failing: MigrationHistoryStore = { ...adapter, applyAndRecord: async () => { throw new Error("DDL failed"); } };
        await expect(runVersionedMigrations("sqlserver", [first], failing)).rejects.toThrow("DDL failed");
        expect(history).toEqual([]);
        expect(events).toEqual(["lock", "unlock"]);
    });
    test("skips previously applied prefix", async () => {
        const { adapter, executed } = store([{ id: "001", checksum: migrationChecksum("sqlserver", first) }]);
        expect(await runVersionedMigrations("sqlserver", [first, second], adapter)).toEqual(["002"]);
        expect(executed).toEqual([second.sqlserver]);
    });
});
