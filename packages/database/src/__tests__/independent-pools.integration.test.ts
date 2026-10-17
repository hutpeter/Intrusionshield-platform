import { describe, expect, test } from "@jest/globals";
import { SqlServerProvider } from "../providers/SqlServerProvider.js";

const required = [
    "RUBY_POOL_TEST_SERVER",
    "RUBY_POOL_TEST_USER",
    "RUBY_POOL_TEST_PASSWORD",
    "RUBY_POOL_TEST_DATABASE_A",
    "RUBY_POOL_TEST_DATABASE_B"
] as const;

const enabled = required.every((key) => Boolean(process.env[key]));
const run = enabled ? test : test.skip;

describe("SQL Server provider independent pools (opt-in integration)", () => {
    run("two providers remain connected to distinct physical databases", async () => {
        const server = process.env.RUBY_POOL_TEST_SERVER!;
        const user = process.env.RUBY_POOL_TEST_USER!;
        const password = process.env.RUBY_POOL_TEST_PASSWORD!;
        const databaseA = process.env.RUBY_POOL_TEST_DATABASE_A!;
        const databaseB = process.env.RUBY_POOL_TEST_DATABASE_B!;
        expect(databaseA.toLowerCase()).not.toBe(databaseB.toLowerCase());

        const common = {
            server,
            port: Number(process.env.RUBY_POOL_TEST_PORT ?? "1433"),
            user,
            password,
            encrypt: false,
            trustServerCertificate: true
        };
        const first = new SqlServerProvider({ ...common, database: databaseA });
        const second = new SqlServerProvider({ ...common, database: databaseB });
        try {
            await first.connect();
            await second.connect();

            const a = await first.query<{ databaseName: string }>(
                "SELECT DB_NAME() AS databaseName"
            );
            const b = await second.query<{ databaseName: string }>(
                "SELECT DB_NAME() AS databaseName"
            );
            expect(a.rows[0]?.databaseName).toBe(databaseA);
            expect(b.rows[0]?.databaseName).toBe(databaseB);

            await first.disconnect();
            const stillOpen = await second.query<{ databaseName: string }>(
                "SELECT DB_NAME() AS databaseName"
            );
            expect(stillOpen.rows[0]?.databaseName).toBe(databaseB);
        } finally {
            await first.disconnect();
            await second.disconnect();
        }
    });
});
