# Recorded cycle counts and service thresholds

## One owner check

**U-SERVICE-01 passed November 7, 2026:** Demo operator → Instruments → **Prepare fictional service
threshold example**. The setup records fictional prerequisites, a reviewer fixture policy
of one recorded cycle, and one simulated passed cycle. It opens the instrument.

Expect **Recorded cycles and service**, recorded count **1**, interval **1**, remaining
**0**, and **Service due — new assembly and packaging blocked**. This checks one new
aspect only. Existing records are preserved; no equipment is operated. The current
instrument may still show Registered: the separate service hold blocks new work without
rewriting its identity or invalidating its existing load.

## Counting and threshold semantics

- A confirmed finished load adds one immutable exposure per distinct member instrument.
  Passed, failed and aborted results all count because an instrument may have been exposed.
  Draft creation, cycle start and cancellation do not count. Repeated command receipts,
  competing finishes and duplicate membership cannot add the same load twice.
- Counts are **recorded cycles since tracking began**, not lifetime manufacturer usage,
  cleaning attempts, patient use or a verified machine counter. Older finished loads are
  not backfilled. Instruments without new counts or a configured policy show zero recorded
  counts and no threshold. The tracking start time is displayed once a record exists.
- Policies use interval 1–1,000,000 recorded cycles and a warning lead of 0 through
  interval minus one. Warning appears when the remaining count is at or below this lead;
  reaching/exceeding the interval creates the service-due hold. No clinical interval is
  supplied by default. The reviewer must supply the applicable procedure/manufacturer
  reference; the software does not verify its validity or appropriateness.
- Reviewer authorization (`maintenance:authorize`) is required to configure/change a
  threshold. Changes use the separate service-record version. A due record cannot be
  cleared by raising its threshold. There is no arbitrary counter edit, disable or reset.
- Existing instrument identity versions and frozen inspection/package/load proofs are
  unchanged by counter/policy updates. A due threshold blocks ordinary or scanned new
  tray membership and new packaging at the server. It does not cancel an existing load,
  revoke an already-recorded release, or imply recall. Existing review, recall, returns,
  custody, damage and release controls remain authoritative. A passed current load can
  still be reviewed under those controls.
- To service an instrument, first reconcile its active package/tray/processing custody
  through the existing workflows. The maintenance module still cannot report a repair
  against an active tray or processing hold (RSP-ISS-006). Complete assessment/repair and
  reviewer authorization. Authorization atomically moves the service baseline to the
  current recorded total, retains the total and exposure history, and creates fresh
  receiving/processing holds. Repair evidence alone does not reset it. New cleaning and
  inspection remain required before assembly; no clinical availability is restored.

These are deterministic count thresholds, not predictive maintenance. Calendar-based
service, manufacturer lifetime limits, consumable replacement and machine integration
remain separate future work. Shared service and repair concepts support future Asset
Management, but no asset module is delivered by this increment.

## Persistence, access and projections

Service records use a version namespace separate from instrument identity. The SQLite
**development adapter** adds scoped `sp_service_usage` aggregates and immutable
`sp_service_exposures` keyed by tenant/facility/instrument/load. Counter/event/load/audit
writes share the cycle transaction. Policy changes and baseline resets have their own
attributable service-entity audit events; request receipts preserve retries. Existing
preview databases are extended on startup; no historical records are altered.

Read APIs require instrument read access:

- `GET /instruments/:id/service-usage`
- `GET /instruments/:id/service-usage/history?page=1` (50 exposures/page)
- `GET /instruments/:id/service-usage/audit?page=1` (50 service audit events/page)

`POST /instruments/:id/service-policy` requires maintenance authorization, exact fields,
current service version and confirmation. Browser writes require the existing origin and
CSRF checks. Counts and baselines are never client inputs. The fictional setup route is
preview/operator-only, with simulated reviewer attribution and retry-safe staged commands.

Instrument details/scanned lookup show service counts and status. Dashboard maintenance
work includes due service records as well as existing maintenance holds. Trace reports
include current service facts and a service-due alert; exposure/audit paging provides the
underlying immutable records. This does not claim full historical service-policy snapshots
inside instrument identity versions. Facility/tenant scope applies to every read and write.

## Verification and deferred work

Developer November 6, 2026: 310 scoped tests (167 domain, 111 service/SQLite/HTTP, 32 web),
scoped builds and targeted browser checks. Tests cover all recorded outcomes, once-only
counting, unchanged identity versions, new-assembly denial, valid existing-load review,
policy bypass/validation/scope/version checks, repair-only reset, atomic rollback,
SQLite reopening, role/CSRF/strict-body gates, retry-safe fixture and dashboard projection.
Browser checks cover the due example, count/limit, operator policy restriction, persistence,
dashboard record link and confirmed reviewer policy/approaching-warning display.

U-SERVICE-01 passed November 7, 2026. M-SERVICE-01: owner warning/policy editing, scanned/manual
membership denial, repair/reset, recall/return intersections, concurrent policy/result
changes, failures and audit walkthroughs. M-SERVICE-02: Windows/ES/FR/mobile/accessibility,
representative multi-instrument load performance, equipment-counter reconciliation,
manufacturer evidence and production identity/competency/operational acceptance. These
remain deferred; RSP-ISS-001 independent inspection stays parked.

Owner screenshot November 7, 2026 confirms recorded cycles 1, service interval 1,
remaining 0 and **Service due — new assembly and packaging blocked**. U-SERVICE-01
passed for the displayed fictional threshold example. Manual membership denial, policy
changes, repair/reset and broader M-SERVICE-01–02 remain deferred; developer tests do
not imply owner acceptance of those paths. RSP-ISS-001 remains parked.
