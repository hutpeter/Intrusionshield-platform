# Physical stock reconciliation

## One owner check: U-CONS-05 (pending)

Update/restart the preview and enter as **Demo reviewer**. Open **Consumable lots → Prepare fictional stock count example**. This creates a new fictional lot with a receipt of **10** items and an operator count of **8**, then opens the reviewer decision. Review the recorded **10**, counted **8**, difference **−2** and prefilled simulated review reason/evidence. Tick **I confirm this count decision and any stock adjustment.**, then **Approve stock adjustment**. Expect **Stock count approved.**, Available balance **8** and Net approved adjustments **−2**. This is the only owner check. Operator entry, rejection, stale counts, concurrency, audit rollback and reload are developer-verified.

## Count and decision

- Counts describe whole **available items**, excluding quarantined stock. A stock receipt/balance must already exist. Counted quantity may be zero. The preview uses the existing individual-item unit; no boxes, rolls, fractions or unit conversions are inferred.
- Operators record a count, reason, evidence reference and explicit confirmation. The command captures the current recorded available quantity, stock version, signed difference, actor and recording time. Recording a count does not change stock. It does not verify the physical inventory or introduce a physical stock freeze.
- Only one count per lot can await review. A reviewer approves or rejects it with a separate reason, evidence reference and confirmation. Approval requires a different actor from the count recorder. Rejection preserves the evidence and makes no stock change.
- Any intervening stock movement invalidates approval of that count. Ruby checks both stock version and recorded quantity. Reject the stale count and record a new physical count; there is no automatic rebasing. The client freezes the displayed submission baseline even if its surrounding stock view refreshes.
- A nonzero approved difference appends a **signed adjustment movement** and updates the available balance and net approved adjustments. It does not rewrite received, used, quarantined or discarded totals, earlier movements or package usage. A matching count can be approved without creating a zero movement or incrementing the stock version.
- Conservation is `received + net approved adjustments = available + used + quarantined + discarded`. Existing balances without the new net field mean zero adjustments. Counted balances and absolute net adjustments are bounded to the preview's 1,000,000,000-item limit.
- Count decisions, stock balance, adjustment movement, audits and retry receipts commit atomically. A failed audit rolls everything back. Optimistic count/stock versions and the pending-count constraint prevent duplicate/concurrent approval. Repeating the identical successful command does not apply the adjustment again.

## UI, authorization and persistence

In **Stock and movements**, operators use **Record physical count**. The count list shows its original recorded/counted quantities, difference, reasons, evidence, times and current decision. Reviewers can approve or reject pending counts. Stale counts are labelled and cannot be approved in the UI. Pending counts are flagged in the lot catalogue. Count history has independent fifty-row pagination; earlier stock movement history remains separate.

Count reads require consumable read access. Count entry uses operator consumable write permission; decisions use reviewer `consumables:reconcile`. CSRF, strict fields, source scope and lot/count association checks apply. Source responses are checked for tenant/facility and exact lot/count identities. SQLite adds a scoped count table with a unique partial index for one pending count per lot. It preserves original count fields and appends a permanent single decision; earlier records are not edited by later counts.

Withdrawal, expiry, recall and clinical-use restrictions are unchanged. Counts can reconcile the recorded physical available balance of an expired or withdrawn lot, but approval cannot make that lot usable. Available-balance changes are reflected by stock alerts on their next refresh.

## Deferred work and reuse

Physical counting procedures, location/bin allocation, counting quarantined stock, stock freezes, count schedules, supervisor competency, attachments, correction of an already decided count, initial stocktake without a prior receipt, broader owner exception/full workflow tests and production migrations/indexes/scale/clinical acceptance remain deferred. A stale or mistaken count is rejected and replaced, preserving its history.

The stock ledger, scoped thresholds and count/review/adjustment pattern are intended foundations for **Ruby Asset Management**. Shared inventory services can be extracted when that module's boundaries are defined; sterile-specific packaging and clinical gates must remain with their module. No Asset Management module is implemented here. RSP-ISS-001 independent instrument-inspector enforcement stays parked; this stock review workflow does not change it.

Developer November 10, 2026: 406 scoped tests passed (216 domain, 145 HTTP/SQLite, 45 web), scoped builds and Chromium reviewer helper/negative adjustment/operator entry/zero-difference approval/refresh passed. Tests cover positive/negative/zero counts, pending uniqueness, independent approval, stale stock, rejection, strict quantity/scope/CSRF/role checks, idempotency, two-connection approval races, atomic audit rollback and SQLite reopen. No U-CONS-05 owner pass is inferred.
