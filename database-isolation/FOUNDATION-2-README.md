# Ruby Database Isolation — Foundation 2 (safe first increment)

## Included

- Athena service bootstrapping now resolves the `ATHENA` role using the existing Foundation 1 resolver. Without `RUBY_ATHENA_DB_*` overrides, the service retains the existing `DB_*` connection.
- `migration-manifest.json` declares an explicit Athena migration order and the current *combined* BAS/EMS + Telemetry migration order, including both `002` files. It is documentation/configuration, **not an executable migration runner**.
- No SQL schema modifications, data migrations, cross-database joins or tenant routing are performed.

## Configuration

Set `RUBY_ATHENA_DB_DATABASE` to select a dedicated Athena DB, and optionally `RUBY_ATHENA_DB_SERVER`, `RUBY_ATHENA_DB_PORT`, `RUBY_ATHENA_DB_USER`, `RUBY_ATHENA_DB_PASSWORD`, `RUBY_ATHENA_DB_ENCRYPT`, `RUBY_ATHENA_DB_TRUST_SERVER_CERTIFICATE`. Do **not** enable these overrides until the target database is provisioned and migrations validated.

## Existing dependency barriers

- `services/telemetry-energy/sql/001_telemetry_energy_foundation.sql` creates both `Telemetry.*` and `Energy.*` objects. This cannot be assigned wholesale to either future independent database.
- `002_energy_contract_management.sql` and `010_bas_equipment_commands.sql` have foreign keys referencing `Telemetry.*` objects.
- `012_telemetry_storage_policies.sql` depends on `Telemetry.Sites`, `Telemetry.Devices`, and `Telemetry.MeasurementDefinitions`.
- `008_regional_configuration.sql` and `009_region_service_area_configuration.sql` contain regional and service-area functionality requiring a domain ownership decision.
- Athena's nine production migration files all target `HIS.*` objects in the examined export; the `998`/`999` files are validation scripts, not production migrations.

## Local verification

```powershell
pnpm --filter @intrusionshield/his-service build
pnpm --filter @intrusionshield/his-service test
git diff --check
git status --short
```

Do not change environment variables or execute SQL migrations yet. Next implementation: a migration runner with checksum tracking and isolated fresh-database integration tests; then a BAS/Telemetry schema redesign and tenant-aware routing.
