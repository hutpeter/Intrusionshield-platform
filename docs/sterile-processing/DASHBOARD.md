# Operational dashboard and work queues

The preview now opens on Operational dashboard. Eight scoped, read-only queues show
exact totals and the oldest 12 records, ordered by last update then ID. Refresh queues
fetches a new snapshot. Open record loads the current scoped record using existing
workflow controls. Open workspace opens its normal module list, without a queue filter.

| Queue | Included records |
| --- | --- |
| Cleaning | Received episodes or failed cleaning/inspection awaiting further work |
| Inspection | Episodes awaiting inspection |
| Assembly | Draft tray assemblies |
| Loading | Packaged records with active package custody, no load assignment, return or recall block |
| Release | Passed loads awaiting review without a final release/rejection; held reviews remain pending |
| Returns | Returned packages awaiting disposition |
| Recall | Open cases or cases with instrument restrictions awaiting receiving admission |
| Maintenance | Instruments in maintenance state |

Queues count different record types and may overlap; their totals must not be summed
as inventory. Related items counts contents, not queue records. Historical permanent
package recall blocks alone do not create outstanding recall work. Running cleaning,
failed/aborted loads and completed dispositions are outside these specific queues.

The endpoint requires dashboard read access and each queue's source-module read
permission. Restricted queues expose neither totals nor rows and are not queried.
All SQL is tenant/facility scoped. Counts and rows share a transaction. The endpoint
creates no audit events or workflow writes. A snapshot does not establish clinical
availability, priority, an SLA or authorization for the next action. Live permissions,
versions, custody and holds remain enforced by the destination workflow.

## One owner check

U-DASH-01 pending: as Demo operator, open Dashboard → Returns awaiting disposition →
Open record. Confirm the return code matches the queue and the record says Returned —
awaiting disposition. An empty queue is valid if all returns have already been disposed;
use an existing pending return when available. Do not repeat the complete processing cycle.

Developer checks: 292 scoped tests (156 domain, 106 service, 30 web), builds and targeted
browser queue navigation. Broader owner checks for all queue types, empty/restricted/error
states, refresh after competing changes, ES/FR, responsive layouts, large facilities and
production query performance remain deferred (M-DASH-01). RSP-ISS-001 remains parked.

Developer browser verification November 6: all eight cards rendered; links from the seven
populated queues (cleaning, inspection, assembly, release, returns, recall, maintenance)
opened matching current record headings. Refresh passed with no browser errors. Loading
was empty in this fixture; its SQL classification is covered by automated checks.
