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

`applyDatabaseMigrations` selects explicitly reviewed SQL Server or PostgreSQL DDL for each migration ID, validates unique IDs, and executes migrations in order. **This is an experimental execution foundation, not a production migration system**: it does not yet persist applied versions, lock concurrent deployments, or guarantee transactional DDL across engines. The `planDatabaseMigrations` helper detects checksum drift and history gaps. `runVersionedMigrations` adds history-aware orchestration and an atomic `applyAndRecord` store contract, with database-backed adapters for both engines. `SqlServerMigrationHistoryStore` uses a transaction-owned `sp_getapplock`; `PostgreSqlMigrationHistoryStore` uses `pg_advisory_xact_lock`. Each records DDL and migration history in the same transaction. Live CI exercises history persistence, rollback (including DDL created before a later migration fails), checksum drift, and concurrent deployment attempts. Persisted migration identifiers and SHA-256 digests are validated before planning. Destructive fixture tests require `RUBY_TEST_MIGRATION_HISTORY=1` and must only run against disposable test databases; never enable that flag against production. These adapters have not yet been deployed across vertical schemas. The orchestrator holds `withExclusiveLock` across history inspection and execution. Both concrete adapters use transaction-scoped locks and transactional DDL/history recording. Production deployment still needs permission hardening, recovery drills, migration catalogs for vertical schemas, and safe handling of non-transactional DDL. Never run it blindly against an existing production database. The production migration orchestrator must provide history, locking, drift checks, rollback/recovery guidance, and privileged deployment identities before adoption.

## Validation

GitHub Actions runs package tests and live integration tests against SQL Server 2022 and PostgreSQL/PostGIS. These validate adapter behavior and representative RLS scenarios, **not** complete isolation across all Ruby services. See `.github/workflows/database-portability.yml`.

## Remaining release gates

1. Inventory SQL Server-specific queries, stored procedures, schema definitions, and GIS types across all vertical branches.
2. Introduce provider-specific, versioned schema migrations, including SQL Server and PostgreSQL RLS policies.
3. Wire the tenant-only facade into Athena, Tiger, BAS/EMS, and other tenant-owned repositories; reject unscoped access.
4. Validate role permissions, concurrency, failure cleanup, transaction nesting, and tenant isolation with non-privileged accounts.
5. Add spatial adapters for SQL Server spatial types and PostGIS, including SRID handling, spatial indexes, and distance/containment queries.
6. Run end-to-end acceptance suites against both engines before merging or claiming on-premises database portability.


### Spatial indexes

`createGeographyIndexSql` generates provider-specific WGS84 geography index DDL: SQL Server `GEOGRAPHY_AUTO_GRID` spatial indexes and PostGIS GiST indexes. The table, column and index names are strictly validated, and schema-qualified table names are supported. The resulting DDL belongs in versioned migrations; do not execute it dynamically from application requests. Live integration checks create and inspect disposable spatial indexes on both engines. Coordinate-reference transformations, spatial intersection/containment, and multi-geometry support remain future work.


### Spatial relations

`spatialRelationPredicate` supports geography intersection on SQL Server and PostgreSQL/PostGIS, and PostGIS containment via explicit geography-to-geometry casts (planar WGS84 semantics, not geodesic polygon containment). SQL Server geography containment currently fails closed rather than emitting a potentially unsupported geometry-only method; a dedicated point-in-polygon adapter and cross-engine boundary semantics remain open work. Live engine-specific tests verify supported relationships. Do not assume containment parity until these semantics are implemented and verified.

`pointInAreaPredicate` provides a common WGS84 geography point-in-polygon test via `STIntersects` / `ST_Intersects`, including boundary points. The caller must ensure that the right-hand geography column contains points; it is not a general polygon-contains-polygon operator. Live polygon fixtures exercise the helper on both engines.


### Nearest-site distance ordering

`createDistanceExpression` emits parameterized WGS84 geography distance expressions in metres, suitable for selecting or ordering candidate sites/assets by proximity. SQL Server uses `STDistance` and PostGIS uses `ST_Distance` on geography. Live integration tests confirm nearest-first ordering on both databases. This helper does not itself select a query plan or guarantee index-assisted nearest-neighbor performance; large datasets require execution-plan and performance testing.


### Portable spatial identifier policy

GIS SQL-generation helpers accept only single ASCII identifiers matching `[A-Za-z_][A-Za-z0-9_]*`, with a maximum of 63 characters. Spatial-index table names may be optionally schema-qualified using two individually validated components. This conservative common subset avoids PostgreSQL's default 63-byte identifier truncation and rejects identifier injection; schema and column identifiers must originate from trusted application metadata. Non-spatial SQL generation is not yet covered by this policy.


### Runtime engine selection

`createDatabaseProvider`, `createTenantScopedDatabaseProvider`, and `createDatabaseDialect` accept only the configured `sqlserver` and `postgresql` engines. Unknown engine strings are rejected at runtime even when supplied through untyped environment/configuration data. This does not replace validation of host credentials, TLS settings, tenant entitlements, or the target database schema.


### Migration deployment preflight

The versioned migration runner validates the complete requested engine-specific migration batch (engine, unique IDs, and nonempty SQL) **before** acquiring its deployment lock or allowing the history adapter to create its table. After acquiring the lock, it re-reads durable history and performs ordered checksum-drift checks before executing pending DDL. The initial preflight is not a substitute for the locked history check. Migration SQL must still be trusted, reviewed, and executable as a single driver request.


### WGS84 point storage declarations

`createWgs84PointColumnSql` generates a reviewed-migration column declaration for point locations. PostGIS uses `geography(Point,4326)` and requires the PostGIS extension to be provisioned by an appropriately privileged deployment role. SQL Server uses `geography`, which **does not enforce Point geometry type or SRID 4326 at the column type level**; applications must validate values and provision appropriate constraints where necessary. The helper does not create tables, enforce tenant isolation, install PostGIS, or automatically apply migrations.


For SQL Server, `createWgs84PointCheckSql` generates the CHECK predicate for `STSrid = 4326`, `STGeometryType() = 'Point'`, and nonempty geography values. Reviewed migrations must attach this expression to a named CHECK constraint; use the nullable variant when the column permits NULL. PostGIS's `geography(Point,4326)` type already restricts geometry type and SRID, so the helper returns `TRUE` for PostgreSQL; an additional nonempty-geometry constraint is still required if empty points must be prohibited. These constraints are not automatically installed by the column helper.
