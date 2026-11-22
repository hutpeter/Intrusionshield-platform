# Ruby database portability — adoption audit and gates

## Scope and evidence

This document tracks the distinction between the **database package portability foundation** and **vertical application adoption**. The foundation branch is `feature/database-engine-independence`; the PR base is `feature/athena-account-administration`. The repository also has independently evolving branches including `feature/sterile-processing-preview`, `feature/his-domain-foundation`, `feature/database-isolation-foundation`, `feature/licensing-control-plane`, and `feature/sterile-processing-foundation`. Do not assume changes on the portability branch are present on those branches or in separately hosted Tiger/TMS repositories.

The `packages/database` entrypoint exists on both the Athena account-administration and sterile-processing-preview branches; the portability branch adds PostgreSQL, migration-history, and spatial APIs. That is **shared package evolution, not evidence of vertical migration**. Paths and database usage in all verticals still require an inventory against their active branch heads.

## Current verified foundation

- SQL Server and PostgreSQL providers, tenant transaction scoping and tenant-access facade.
- Engine-specific versioned migration stores with durable history, checksums and deployment locks.
- WGS84 point validation, distance filtering and nearest-site distance expressions.
- Spatial index DDL, point-in-area intersection, and provider-specific spatial relationship handling.
- Automated database-package and live engine integration jobs. **Check the latest commit CI before calling it green.**

## Required vertical adoption matrix

| Surface | Required investigation | Completion gate |
| --- | --- | --- |
| Athena HIS | Inspect active HIS branches, schema creation, repository queries, transactions, pagination, tenant filters and identity/UUID assumptions | Run HIS unit/integration suites against SQL Server **and** PostgreSQL with equivalent behavior |
| BAS/EMS and Solar | Inventory telemetry ingestion, retention/upserts, time-series aggregation, bulk writes and geospatial site queries | Exercise ingestion, history and tenant isolation on both engines under representative volume |
| Tiger sterile processing | Compare standalone repository with sterile-processing branches; inspect traceability, sterilizer events, audit and instrument-release transactions | Pass controlled release and equipment integration tests on both engines without Athena dependency |
| Admin/onboarding and licensing | Inspect tenant provisioning, entitlement enforcement, migration bootstrap and license audits | Provision fresh tenants and enforce entitlement boundaries on both engines |
| TMS and case/document management | Inventory independently hosted repositories before assuming reuse | Publish migration plan and dual-engine tests for each product before production support claims |
| Shared GIS | Define CRS conversion, spatial index lifecycle, boundary behavior, geometry support and nearest-neighbor performance | Cross-engine fixture parity and representative indexed query plans |

## Non-negotiable acceptance gates

1. Identify every active product branch and any separate repositories; inventory direct SQL Server drivers, raw T-SQL, DDL, stored procedures, SQL Server-specific types and migrations.
2. Introduce a provider-neutral contract at **each actual data-access boundary**, not just in `packages/database`.
3. Convert schema provisioning and upgrades into versioned, repeatable SQL Server/PostgreSQL migrations; include PostGIS extension permissions and spatial indexes.
4. Test real tenant isolation with restricted database users and concurrent workloads on both engines.
5. Run product-specific end-to-end tests and migration/rollback drills on both engines; measure high-volume telemetry and spatial query performance.
6. Define backup, restore, operational monitoring and deployment settings for each supported engine.
7. Do not merge the portability PR or declare platform-wide independence until these gates are satisfied.

## Next code adoption sequence

1. Resolve all latest database portability CI failures and keep live integration jobs green.
2. Locate HIS, telemetry, Tiger and administration source roots at their current branch heads; record file-level SQL Server dependencies and owning services.
3. Port one representative tenant-scoped HIS repository and its schema migration end to end; prove SQL Server/PostgreSQL parity before broadening.
4. Repeat for telemetry ingestion and sterile-processing transactions, then complete GIS parity and load tests.

**Status:** foundation in progress; vertical adoption and complete cross-branch source audit are **not yet verified**.
