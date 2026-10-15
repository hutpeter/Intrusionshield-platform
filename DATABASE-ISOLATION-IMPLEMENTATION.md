# Ruby Database Isolation — Foundation 1

## What this patch does

Adds backward-compatible **per-service SQL Server connection resolution** to `@intrusionshield/database`.
Authentication resolves the `PLATFORM` database role. The existing telemetry-energy service resolves `BAS_EMS`.
When no role-specific environment variables are configured, both use existing `DB_*` settings.
No schema changes or data migrations occur automatically.

## Environment configuration example (development only)

```powershell
$env:RUBY_PLATFORM_DB_DATABASE = "RubyPlatformDev"
$env:RUBY_BAS_EMS_DB_DATABASE = "RubyBasEmsDev"
```

Do **not** set these until you have provisioned the databases and applied the correct migrations.
Role-specific host, port, user, password, TLS settings can be set via:
`RUBY_<ROLE>_DB_SERVER`, `_PORT`, `_DATABASE`, `_USER`, `_PASSWORD`, `_ENCRYPT`, `_TRUST_SERVER_CERTIFICATE`.
Never commit secrets to Git. Use your secrets manager in production.

## Apply and verify

1. Back up/commit the current repository before overlaying the patch.
2. Copy the `packages` and `services` folders over the repository root.
3. From repository root:

```powershell
pnpm --filter @intrusionshield/database build
pnpm --filter @intrusionshield/database test
pnpm --filter @intrusionshield/authentication-service build
pnpm --filter @intrusionshield/telemetry-energy-service build
```

Check the authentication package's exact filter in its `package.json` if it differs.

## Not yet implemented — required before independent product deployment

- Separate schemas and databases with audited migrations and ownership boundaries.
- Tenant/product database mapping, secured provisioning and tenant-aware routing.
- Removal of direct cross-product table access and cross-database joins.
- Independent migration runners, backups, restore, and operational monitoring.
- Automated end-to-end tests with independent database instances.
- Separation of telemetry persistence from BAS/EMS (a distinct `TELEMETRY` role is reserved).

**Critical:** `services/telemetry-energy` currently combines BAS/EMS and telemetry persistence.
It therefore uses one `BAS_EMS` role until the repository/ingestion architecture is split.
This patch is the initial connection isolation foundation, NOT a completed independent-deployment architecture.

## Migration inventory observed in provided source exports

- `services/authentication/sql/001_authentication_foundation.sql`: platform/authentication domain, review tenant ownership.
- `services/telemetry-energy/sql/001...012...`: mixed BAS/EMS, telemetry, solar/energy, and policy domain migrations.
- Migration name collision: `002_energy_contract_management.sql` and `002_telemetry_reading_source.sql` share a numeric prefix; use explicit migration IDs and checksums before adopting independent runners.

The source export did not contain Athena SQL migrations or the `packages/config` source. They must be audited separately before declaring Athena isolation complete.
