# Stock count review queue

The Operational dashboard includes **Stock counts awaiting review**. It lists pending available-item counts, ordered oldest first with a stable count-ID tie break, exact totals and twelve-row paging. Reads do not change counts, stock, decisions or audit history.

**Ready for review** means the recorded stock version and available quantity still match current stock. **New count required** means a later stock movement invalidated that snapshot (or the stock record is unavailable). Rows show recorded, counted and current available quantities, signed difference, original reason and evidence. A stale count must be rejected and a new physical count recorded; approval remains blocked by the existing domain checks.

**Open record** carries both lot ID and count ID. It loads that exact count's current state in **Selected stock count**, even when it is outside the first count-history page or was decided after the dashboard snapshot. Approval/rejection uses the existing separate confirmation workflow, independent actor rule, optimistic versions, idempotency and atomic stock/audit protections. Decided counts leave the pending queue on refresh.

The queue requires dashboard read, consumable read and `consumables:reconcile`. Users without source/reviewer access get no source query, records or total; the paged endpoint returns 403. Count reads in the lot workspace retain existing consumable-read permissions. Tenant/facility and lot/count association checks apply to direct links.

## One owner check — U-REVIEWQ-01 passed November 10, 2026

After updating/restarting, enter as **Demo reviewer → Operational dashboard → Prepare fictional review queue example**. In **Stock counts awaiting review**, expect two new fictional rows: **Ready for review** and **New count required**. Both show recorded 10, counted 8 and difference −2; the stale row has current available 12. This check requires no stock decision. Global totals/codes vary with existing data; use Next if earlier counts occupy the first page.

The reviewer-only local helper records two new operator counts with simulated reasons/evidence. One has a later receipt; neither is approved automatically. Request retries preserve the same source records.

## Validation and deferred work

Scoped builds, 409 tests (216 domain, 147 HTTP/SQLite, 46 web) and Chromium verify ready/stale metadata, exact source navigation, approval/removal and stale approval denial. Automated checks cover hidden permissions/totals, strict requests, helper retry safety, stable paging, source association, independent decisions and SQLite reopen. U-CONS-05 passed from the owner's November 10 screenshot. U-REVIEWQ-01 passed November 10, 2026 from the owner dashboard screenshot.

Physical stocktake policy, location/quarantine counting, stock freezes, production scale, notifications and broad owner exception acceptance remain deferred. U-TRACE-01 and original U-LOANER-01 remain unconfirmed. RSP-ISS-001 stays parked. Reuse of the stock ledger, thresholds and reviewer workflow for future Ruby Asset Management remains intended; no Asset module is implemented here.
