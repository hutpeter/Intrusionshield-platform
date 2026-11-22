import { describe, expect, test } from "@jest/globals";
import { runVersionedMigrations, type MigrationHistoryStore } from "../VersionedMigrationRunner.js";
import { migrationChecksum, type AppliedMigrationRecord } from "../MigrationPlan.js";

const first = { id: "001", description: "first", sqlserver: "SELECT 1", postgresql: "SELECT 1::int" };
const second = { id: "002", description: "second", sqlserver: "SELECT 2", postgresql: "SELECT 2::int" };

function store(initial: AppliedMigrationRecord[] = []) {
    const history = [...initial];
    const executed: string[] = [];
    const adapter: MigrationHistoryStore = {
        readApplied: async () => [...history],
        applyAndRecord: async (migration, sql, checksum) => {
            executed.push(sql);
            history.push({ id: migration.id, checksum });
        }
    };
    return { adapter, executed, history };
}

describe("versioned migration orchestration", () => {
    test("applies pending migrations and skips them on second run", async () => {
        const { adapter, executed } = store();
        expect(await runVersionedMigrations("postgresql", [first, second], adapter)).toEqual(["001", "002"]);
        expect(await runVersionedMigrations("postgresql", [first, second], adapter)).toEqual([]);
        expect(executed).toEqual([first.postgresql, second.postgresql]);
    });
    test("detects drift before executing pending work", async () => {
        const { adapter, executed } = store([{ id: "001", checksum: "changed" }]);
        await expect(runVersionedMigrations("sqlserver", [first, second], adapter)).rejects.toThrow("checksum drift");
        expect(executed).toEqual([]);
    });
    test("preserves history when a migration fails before recording", async () => {
        const { adapter, history } = store();
        adapter.applyAndRecord = async () => { throw new Error("DDL failed"); };
        await expect(runVersionedMigrations("sqlserver", [first], adapter)).rejects.toThrow("DDL failed");
        expect(history).toEqual([]);
    });
    test("skips previously applied prefix", async () => {
        const { adapter, executed } = store([{ id: "001", checksum: migrationChecksum("sqlserver", first) }]);
        expect(await runVersionedMigrations("sqlserver", [first, second], adapter)).toEqual(["002"]);
        expect(executed).toEqual([second.sqlserver]);
    });
});
