# Operational dashboard and work queues

The preview now opens on Operational dashboard. Eight scoped, read-only queues show
exact totals and 12 records per page, ordered oldest first by last update then ID.
Each card has Previous/Next controls and its own snapshot time. Refresh queues resets
all cards to page 1 and fetches a new snapshot. Open record loads the current scoped record using existing
workflow controls. Open workspace opens its normal module list, without a queue filter.

| Queue | Included records |
| --- | --- |
| Cleaning | Received episodes or failed cleaning/inspection awaiting further work |
| Inspection | Episodes awaiting inspection |
| Assembly | Draft tray assemblies |
| Loading | Packaged records with active package custody, no load assignment, return or recall block |
| Release | Passed loads awaiting review without a final release/rejection; held reviews remain pending |
| Returns | Returned packages awaiting reconciliation or disposition, including blocked shortages |
| Recall | Open cases or cases with instrument restrictions awaiting receiving admission |
| Maintenance | Instruments in maintenance state or due for count-based service |

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

## Current owner check — queue paging

**U-DASHPAGE-01 Next passed November 6, 2026; owner Previous check unconfirmed:** as Demo operator, click **Prepare fictional queue paging
example** once on Operational dashboard. This explicitly creates 13 new fictional
receiving episodes with processing holds; existing records stay intact. In **Cleaning
awaiting work**, click **Next** and confirm **Page 2** shows different receipt codes.
Click **Previous** to return to Page 1. No processing actions are required.

The setup endpoint is local-preview-only, operator-only, CSRF protected and strict-body
validated. Its type/instrument/receipt writes commit together and retry with the same
request ID without duplicating records. No physical cleaning is performed.

Paging rechecks dashboard and source-module permissions for every request. Unknown
queue names, extra query keys, duplicate parameters and invalid page numbers are refused.
Pages are bounded to 1–99,999 and 12 rows. Counts and rows within one page are consistent;
browsing different pages is not a frozen cross-page snapshot. Records can move or disappear
as work progresses. Refresh to reconcile; an emptied later page still permits Previous.
Oldest-first is based on the record's last update, not an agreed priority or SLA.

Developer November 6, 2026: 295 scoped tests (157 domain, 107 service, 31 web), scoped
builds and browser Next/Previous, distinct records, page-two record opening and refresh
reset passed. M-DASHPAGE-01 owner concurrent-change, role-change, failure, language/mobile,
large-site performance and accessibility checks remain deferred.

## Completed initial owner check

U-DASH-01 passed November 6, 2026 (owner confirmation); original check: as Demo operator, open Dashboard → Returns awaiting disposition →
Open record. Confirm the return code matches the queue and the record says Returned —
awaiting disposition. An empty queue is valid if all returns have already been disposed;
use an existing pending return when available. Do not repeat the complete processing cycle.

Initial dashboard developer checks: 292 scoped tests (156 domain, 106 service, 30 web), builds and targeted
browser queue navigation. Broader owner checks for all queue types, empty/restricted/error
states, refresh after competing changes, ES/FR, responsive layouts, large facilities and
production query performance remain deferred (M-DASH-01). RSP-ISS-001 remains parked.

Developer browser verification November 6: all eight cards rendered; links from the seven
populated queues (cleaning, inspection, assembly, release, returns, recall, maintenance)
opened matching current record headings. Refresh passed with no browser errors. Loading
was empty in this fixture; its SQL classification is covered by automated checks.

Owner evidence November 6, 2026: “it shows different codes” confirms Next/page-two
record changes. Previous remains developer-verified only and is deferred with
M-DASHPAGE-01; no owner pass is inferred for that control or broader testing.
