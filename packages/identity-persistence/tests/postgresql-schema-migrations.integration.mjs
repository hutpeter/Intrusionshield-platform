import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PostgreSqlProvider, PostgreSqlMigrationHistoryStore, runVersionedMigrations } from "../../database/dist/index.js";

// Run only against the disposable CI database with the schema-migration principal.
const provider = new PostgreSqlProvider({
    host: process.env.RUBY_TEST_POSTGRES_HOST ?? "localhost",
    port: Number(process.env.RUBY_TEST_POSTGRES_PORT ?? 5432),
    database: process.env.RUBY_TEST_POSTGRES_DB ?? "ruby_portability_test",
    user: process.env.RUBY_TEST_POSTGRES_USER ?? "ruby_test",
    password: process.env.RUBY_TEST_POSTGRES_PASSWORD ?? ""
});
const directory = new URL("../sql/postgresql/", import.meta.url);
const files = [
    ["identity_001", "001_identity_foundation.sql"],
    ["identity_002", "002_authorization_foundation.sql"]
];
const migrations = await Promise.all(files.map(async ([id, file]) => ({
    id,
    description: file,
    postgresql: await readFile(new URL(file, directory), "utf8"),
    sqlserver: "-- PostgreSQL integration fixture only"
})));
await provider.connect();
try {
    const store = new PostgreSqlMigrationHistoryStore(provider);
    assert.deepEqual(await runVersionedMigrations("postgresql", migrations, store), files.map(([id]) => id));
    assert.deepEqual(await runVersionedMigrations("postgresql", migrations, store), []);
    const tables = await provider.query(
        'SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = $1',
        [{ name: "schema", value: "Identity" }]
    );
    assert.ok(tables.rows[0].count >= 9, "Identity and authorization tables must exist");
    const policies = await provider.query(
        'SELECT COUNT(*)::int AS count FROM pg_policies WHERE schemaname = $1',
        [{ name: "schema", value: "Identity" }]
    );
    assert.ok(policies.rows[0].count >= 6, "Tenant RLS policies must exist");
    console.log("Versioned PostgreSQL identity schema migrations passed");
} finally {
    await provider.disconnect();
}
