# Ruby database portability

The shared database package supports **SQL Server** and **PostgreSQL** through provider-specific adapters. SQL text and schema migrations are not yet universally portable; vertical-specific repositories must be audited and migrated separately.

## Tenant-safe application entry point

Use `createTenantScopedDatabaseProvider` and `TenantDatabaseAccess` for tenant-owned data. Resolve the tenant identifier from authenticated server-side authorization context, **never from an unverified request parameter**.

```ts
import { createTenantScopedDatabaseProvider, TenantDatabaseAccess } from "@intrusionshield/database";

const provider = createTenantScopedDatabaseProvider(config);
await provider.connect();
const tenantData = new TenantDatabaseAccess(provider);
const result = await tenantData.forTenant(authenticatedTenantId, session =>
    session.query("SELECT item FROM tenant_owned_items")
);
```

The callback only receives `query` and `execute`; the session expires when the callback ends. Avoid retaining raw providers in application services that handle tenant-owned data. Privileged administration and migrations must use a separate, explicitly authorized path.

## Database-enforced tenant isolation

**The facade is not a substitute for Row-Level Security.** Every tenant-owned table must have a fail-closed read predicate and write-blocking predicates, with no-tenant-context behavior tested. SQL Server policies can use `SESSION_CONTEXT(N'ruby.tenant_id')`; PostgreSQL policies can use `current_setting('ruby.tenant_id', true)`. The PostgreSQL provider uses a transaction-local setting; the SQL Server provider explicitly clears connection-scoped session context before releasing its transaction.

Schema provisioning, policy deployment, migration ordering, privileged-role separation, cross-tenant administrator access, and production permissions still require implementation and verification for each vertical.

## Geospatial foundation

The shared `withinDistancePredicate` helper generates a parameterized WGS84 geography proximity predicate for SQL Server and PostGIS. It expects a geography-typed column, latitude/longitude in degrees, and radius in metres. SQL Server uses `geography::Point(latitude, longitude, 4326)`; PostGIS uses `ST_MakePoint(longitude, latitude)` cast to geography. `createWithinDistanceQuery` additionally validates WGS84 latitude/longitude, non-negative finite radius, and binds all values as provider-specific parameters. This is a first spatial primitive, **not** complete GIS portability; spatial DDL, indexing, geometry operations, and CRS transformations remain release gates.

## Migration foundation

`applyDatabaseMigrations` selects explicitly reviewed SQL Server or PostgreSQL DDL for each migration ID, validates unique IDs, and executes migrations in order. **This is an experimental execution foundation, not a production migration system**: it does not yet persist applied versions, lock concurrent deployments, or guarantee transactional DDL across engines. The `planDatabaseMigrations` helper detects checksum drift and history gaps. `runVersionedMigrations` adds history-aware orchestration and an atomic `applyAndRecord` store contract, with database-backed adapters for both engines. `SqlServerMigrationHistoryStore` uses a transaction-owned `sp_getapplock`; `PostgreSqlMigrationHistoryStore` uses `pg_advisory_xact_lock`. Each records DDL and migration history in the same transaction. Live CI exercises history persistence, rollback, checksum drift, and concurrent deployment attempts. Destructive fixture tests require `RUBY_TEST_MIGRATION_HISTORY=1` and must only run against disposable test databases; never enable that flag against production. These adapters have not yet been deployed across vertical schemas. The orchestrator holds `withExclusiveLock` across history inspection and execution. Both concrete adapters use transaction-scoped locks and transactional DDL/history recording. Production deployment still needs permission hardening, recovery drills, migration catalogs for vertical schemas, and safe handling of non-transactional DDL. Never run it blindly against an existing production database. The production migration orchestrator must provide history, locking, drift checks, rollback/recovery guidance, and privileged deployment identities before adoption.

## Validation

GitHub Actions runs package tests and live integration tests against SQL Server 2022 and PostgreSQL/PostGIS. These validate adapter behavior and representative RLS scenarios, **not** complete isolation across all Ruby services. See `.github/workflows/database-portability.yml`.

## Remaining release gates

1. Inventory SQL Server-specific queries, stored procedures, schema definitions, and GIS types across all vertical branches.
2. Introduce provider-specific, versioned schema migrations, including SQL Server and PostgreSQL RLS policies.
3. Wire the tenant-only facade into Athena, Tiger, BAS/EMS, and other tenant-owned repositories; reject unscoped access.
4. Validate role permissions, concurrency, failure cleanup, transaction nesting, and tenant isolation with non-privileged accounts.
5. Add spatial adapters for SQL Server spatial types and PostGIS, including SRID handling, spatial indexes, and distance/containment queries.
6. Run end-to-end acceptance suites against both engines before merging or claiming on-premises database portability.
