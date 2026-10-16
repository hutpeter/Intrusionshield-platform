# Ruby database isolation — Foundation 2B

This increment adds a guarded, explicit-order SQL Server migration runner. It does **not** create a database, move tables, split BAS/EMS from Telemetry, or modify the existing manifest.

## Files

- `database-isolation/migrate.mjs`: executable migration planner / Athena migration runner.
- `database-isolation/migrate.test.mjs`: Node built-in tests.

## Verify without a database

From repository root:

```powershell
node --test database-isolation/migrate.test.mjs
node database-isolation/migrate.mjs --role ATHENA --plan
node database-isolation/migrate.mjs --role BAS_EMS --plan
```

`--plan` is the default. It reads the SQL and prints migration filenames, SHA-256 hashes and batch counts. It never connects to SQL Server.

## Fresh Athena database only (later, with DBA approval)

1. Provision a **new, empty** SQL Server database and a dedicated migration account with schema DDL rights. Take backups and validate access beforehand.
2. Set `RUBY_ATHENA_DB_SERVER`, `RUBY_ATHENA_DB_DATABASE`, `RUBY_ATHENA_DB_USER`, `RUBY_ATHENA_DB_PASSWORD` (and optionally `RUBY_ATHENA_DB_PORT`, `RUBY_ATHENA_DB_ENCRYPT`, `RUBY_ATHENA_DB_TRUST_SERVER_CERTIFICATE`).
3. Set `RUBY_MIGRATION_CONFIRM=ATHENA` and explicitly run `node database-isolation/migrate.mjs --role ATHENA --apply`.
4. Independently run Athena integration and database validation tests before changing service deployment settings.

Do **not** run `--apply` against the existing shared production database. No database commands are needed for the current Foundation 2B code validation.

## Safeguards and limitations

- Requires all Athena connection variables explicitly, with no fallback to `DB_*`.
- Rejects existing `HIS` schemas lacking migration history (manual baseline needed).
- Holds an exclusive SQL Server application lock during migrations.
- Uses a per-database `dbo.RubySchemaMigrations` table and SHA-256 checksums.
- Refuses checksum changes, unknown history rows and out-of-order history.
- Executes `GO`-delimited batches in manifest order; scripts with internal transactions manage their own atomicity.
- **A failure partway through a migration may leave partial changes**. Investigate and repair before retrying; do not mark a failed migration as applied.
- `GO` splitting supports standalone `GO` lines and optional repeat counts, not a full SQLCMD parser. Review SQL files for unsupported directives before executing.
- BAS_EMS is **plan-only**; Telemetry remains coupled to BAS/EMS.
- No integration test against a live SQL Server has been run as part of this package.
