# Ruby Sterile Processing — foundation 1

November 3, 2026. Based on `feature/database-isolation-foundation` at
`dd282bac6b18192c2937e787b1714844a5a92b1c`. Development branch:
`feature/sterile-processing-foundation`. The owner's Windows worktree and four
untracked entries remain untouched. No merge, deployment, real database access,
migration execution or external publication is part of this foundation.

## Independent product

`@intrusionshield/sterile-processing` supplies domain types, catalogue/instance
registration, controlled retirement, transaction/audit/retry contracts and
Spanish/English/French catalogues. `@intrusionshield/sterile-processing-service`
is an independent Express service factory. Neither imports Athena/HIS, energy,
telemetry nor SQL-provider runtime packages. The future operator application will
live in `apps/sterile-processing`; it is not implemented in this first slice.

The full planning bundle is maintained separately for review: 36 draft
requirements, 20 planned acceptance scenarios, bilingual client questionnaire,
standards applicability register, source evidence and tender/product distinction.
The seven supplied files describe an investment, not a complete formal software
bidding specification. No tender-compliance claim is made.

## Implemented API factory

All instrument routes start with
`/api/v1/sterile/facilities/:facilityId`:

- `GET /instrument-types?page=1`: bounded type list.
- `POST /instrument-types`: requestId, code, name, manufacturer, model.
- `GET /instruments?page=1`: bounded list including retired history.
- `POST /instruments`: requestId, instrumentTypeId, code, serialNumber.
- `GET /instruments/:id`: current scoped record.
- `POST /instruments/:id/retire`: requestId, version, reason.

Codes are canonical uppercase ASCII identifiers and unique within tenant/facility.
Human names/manufacturer/model/serial/reasons support Unicode. Global scanner
namespaces and direct-mark formats require later customer agreement. Registration
means **registered**, never sterile/released/available-for-clinical-use. No cycle,
release, patient or hardware-control endpoint is implemented.

The registry validates UUIDs, input limits, type ownership, duplicate codes,
optimistic versions and nonempty retirement reasons. Commands atomically require
business state, audit and a hashed idempotency receipt through the repository
transaction contract. Returning a retry replays the original result; clients must
reload for later changes. Audit is not described as tamper-proof.

## Fail-closed runtime boundary

`createSterileApp()` installs a liveness endpoint and protected routes. Missing
identity, authorization or repository adapters do not enable demo access. A bearer
request returns 503 when dependencies are unconfigured; no bearer returns 401.
There is no implicit in-memory runtime store, public start command or live SQL
connection. `/health` explicitly reports clinicalUseEnabled=false and is liveness,
not proof of clinical readiness. Cookie authentication is rejected; a later browser
session/BFF must add reviewed CSRF/origin protections, not bypass them.

The composition root must inject:

1. Cryptographically verified identity, exact issuer/audience/lifetime and active
   membership, returning trusted tenant/actor/permitted-facility IDs.
2. Central capability (`sterile.core`), RBAC/ABAC and facility authorization.
   The exported capability definition is compatible with Core's registry model;
   it is not automatically installed or granted to any tenant. Do not equate
   domain factory availability with an active commercial licence.
3. A durable repository implementing scoped predicates, uniqueness, transactions,
   audit/retry atomicity and version checks. The only in-memory adapter is under
   `test/`; it is never selected by the service.

Unknown fields/query parameters, caller-injected tenant/actor/facility body
properties, foreign facilities, malformed and oversized JSON are rejected. Errors
use safe codes and no-store responses. There is no CORS credential/session bypass.

## Persistence draft

`services/sterile-processing/sql/001_sterile_foundation.REVIEW_ONLY.sql` defines
facility references, types, instruments, audit and command receipts. It is not
registered with a migration runner and refuses its default database target until
reviewed. A dedicated sterilization database/role, runtime/provisioning identities,
permissions and a SQL adapter must be reviewed separately. No cross-product joins,
foreign HIS table dependencies, migration execution or SQL credentials were added.

The draft has not been executed against SQL Server. Test transactions demonstrate
contract behaviour with a serialized memory adapter, not SQL locking/concurrency,
recovery, constraints or database permission validation.

## Safe development checks

From the repository root, use the existing Node 24+ and pnpm configuration:

```sh
pnpm install --frozen-lockfile --ignore-scripts --filter @intrusionshield/sterile-processing --filter @intrusionshield/sterile-processing-service
pnpm --filter @intrusionshield/sterile-processing test
pnpm --filter @intrusionshield/sterile-processing-service test
```

These new suites use synthetic data and loopback HTTP only. They never read SQL
environment configuration or run migration/integration scripts. Do not substitute
a recursive root test command: the repository contains live integration suites.
The lockfile includes the two new importers; see actual validation results below.

## Next slice

Review/implement dedicated persistence and verified identity/facility/capability
composition, then the Spanish-first operator UI and local startup. After that,
add tray history and receipt/cleaning/packaging workflows, approved quality/release
rules and recall traceability. Optional Athena and device adapters follow their
own contracts and evidence. Do not wire demo authentication or memory persistence
into a clinical deployment to make the first UI appear complete.

## Validation on the managed checkout

- Node 24.19.0; available pnpm runtime 11.25.0. Repository packageManager remains
  11.20.0; exact pinned-version CI has not been executed here.
- Filtered frozen-lockfile install with lifecycle scripts disabled passed.
  Lockfile changes add only the two new package importers; existing package
  resolutions and third-party versions are unchanged.
- Domain TypeScript build and 9 SQL-free tests passed.
- Service TypeScript build and 5 loopback HTTP tests passed, including fail-closed
  configuration, bearer/permission requirements, scoped registration/retirement,
  strict fields/queries, malformed/oversized JSON and safe persistence errors.
- New-file formatting and Git whitespace checks passed. The new workflow is
  configured for these scoped checks; no GitHub run is claimed before publication.
- No recursive legacy tests, SQL integration runner, migration, real equipment,
  provider sign-in, frontend browser validation or production deployment ran.

This is partial implementation evidence for RSP-001/002/003/004/020/022/024/025,
not completion of the full SRS or any clinical acceptance scenario. The complete
20-scenario acceptance plan remains planned/unexecuted. Memory transaction tests
are not proof of SQL isolation or durability.
