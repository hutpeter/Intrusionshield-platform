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
    ["identity_002", "002_authorization_foundation.sql"],
    ["identity_003", "003_application_database_role.sql"]
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
    const role = await provider.query("SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = 'ruby_identity_application'");
    assert.deepEqual(role.rows, [{ rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false }]);
    const grants = await provider.query("SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'ruby_identity_application' AND table_schema = 'Identity' AND privilege_type IN ('INSERT','UPDATE','DELETE') ORDER BY table_name, privilege_type");
    const expected = ["Identities", "IdentityRoles", "ServiceIdentities", "Users"].flatMap(table_name =>
        ["DELETE", "INSERT", "UPDATE"].map(privilege_type => ({ table_name, privilege_type }))
    );
    expected.unshift({ table_name: "AuthorizationAudit", privilege_type: "INSERT" });
    assert.deepEqual(grants.rows, expected, "Runtime write privileges must match the explicit allowlist");
    console.log("Versioned PostgreSQL identity schema migrations passed");
} finally {
    // The subsequent restricted-principal integration suite owns its own migration
    // history fixture. Do not leave a privileged-owned table that it cannot reset.
    try {
        await provider.execute("DROP TABLE IF EXISTS public.ruby_schema_migrations");
    } finally {
        await provider.disconnect();
    }
}
