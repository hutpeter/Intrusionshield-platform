# Ruby database portability: Tiger adoption and deployment

## Validated foundation
SQL Server and PostgreSQL providers, tenant-scoped transactions, dialects, versioned migration history, deployment locks, checksum validation and WGS84 spatial helpers are available through @intrusionshield/database. Live provisioning and repeat deployment passed CI at 24bfbb8.

## Deployment contract
1. Provision an existing database using infrastructure tooling; enable PostGIS where spatial functionality is required.
2. Supply deployment-owned DatabaseProviderConfiguration and a complete ordered DatabaseMigration manifest to provisionDatabaseSchema().
3. Preserve migration IDs and applied SQL permanently. Append new migrations; do not edit applied scripts.
4. Keep deployment credentials separate from runtime credentials. Runtime access must not own protected schemas or migration history.
5. Validate application role membership, tenant isolation and schema readiness before enabling traffic.

## Tiger adoption
- Inventory direct driver imports, SQL Server-specific types, SQL syntax, stored procedures, schema scripts and transaction boundaries.
- Implement repositories using IDatabaseProvider and ITenantScopedDatabaseProvider, with explicit engine dialect selection.
- Derive tenant context from authenticated server-side authorization; never trust arbitrary request tenant IDs.
- Supply equivalent SQL Server and PostgreSQL migrations for each Tiger schema change.
- Test sterile processing lifecycle, instrument traceability, release, recall and equipment integration on both engines before declaring Tiger portable.
- Keep existing Tiger behavior and data intact during conversion.

## Outstanding before foundation acceptance
- Validate PostgreSQL runtime role membership in live integration and reconcile SQL Server/PG write grants.
- Locate and inspect the standalone Tiger repository; its persistence inventory is not yet verified.
- Establish a production migration manifest and provisioning procedure for each product.

## Deferred platform work
Athena, BAS/EMS, Solar and remaining shared service conversion; existing-data migration tooling; full dual-engine product acceptance; additional database engines. Foundation CI does not certify product-level portability.

Do not merge the development branch or deploy to production until explicitly approved.
