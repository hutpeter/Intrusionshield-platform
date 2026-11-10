# Consumable stock receipts and packaging usage

## One owner check: U-CONS-03 (passed November 10, 2026)

Owner screenshot confirms the stock receipt, total/available/usable 10 and movement version 1. Original check: update/restart the preview and enter as **Demo operator**. Open **Consumable lots** → **Prepare fictional stock example**. This creates a new fictional lot and opens a prefilled stock receipt for **10** items. Review the quantity/reason/reference, tick **I confirm this stock movement and quantity.**, then **Save stock movement**. Expect **Stock movement recorded.**, Total received **10** and Available balance **10**. This is the only owner check. Packaging deductions, quarantine/disposal, insufficient stock, concurrent saves and reload are developer-verified.

## Units and starting balance

Stock uses whole individual items (`each`): sheets of wrap, individual pouches or individual indicators. There are no roll/box/length/weight conversions or fractional quantities. The operator must enter the actual count in this unit. Every movement is between 1 and 1,000,000,000 items; cumulative balances also cannot exceed that cap.

Registering a consumable lot does not create stock. No quantities are inferred from past packages or stock that was physically present before tracking. The first confirmed receipt starts at stock version 0 and creates version 1. Existing saved package snapshots and lot withdrawal decisions are preserved.

## Balances and roles

- Demo operator records stock receipts with quantity, reason, delivery/evidence reference and confirmation. Receipts can document stock that is expired or withdrawn; doing so does not make it usable.
- Demo reviewer can quarantine available stock, discard available stock or discard quarantined stock. These are recorded physical-action references, not remote physical actions. There is no quarantine release or stock correction action in this increment.
- All preview roles read balances and paginated movement history. Every receipt/movement uses scoped authorization, CSRF, strict fields, optimistic stock versions and command idempotency.
- `received = available + used + quarantined + discarded`. Quarantine removes available items; disposal removes available or quarantined items according to the explicitly selected action. No balance may become negative. A withdrawn/expired lot has zero usable items even when its recorded available physical balance is positive. Withdrawal does not silently pretend physical stock has been quarantined.
- Stock versions are independent of the lot's attribute/withdrawal/recall version. Stock receipts do not invalidate unrelated lot decisions. Movement history stores its version, resulting balance, actor/time, root request reference and package association where applicable; package usage freezes before/after stock versions. Reads use 50 rows plus sentinel.

## Packaging

New UI packaging requires a registered lot with a positive available balance and a positive whole usage quantity for each selected wrap/pouch and optional indicator lot. The server rechecks current lot expiry/withdrawal and stock inside the packaging transaction, then saves the package, reservations, usage movements, resulting balances and audits atomically. Concurrent saves cannot overspend. A failure in any selected lot or any stock/package audit rolls back the complete action. Retrying a successfully recorded command does not deduct twice.

Package detail, historical versions and traceability/CSV retain the actual quantities, units, lot codes, movement IDs and stock versions. Voiding a package or recording a return does not replenish consumed wrap/indicators. Repacking requires another recorded consumption. Product compatibility and physical count verification remain operator/site responsibilities.

API clients supplying `consumableLotIds` must now also provide `consumableUsage: [{lotId, quantity}, ...]` with exactly one matching entry per selected lot. Missing, duplicate, unknown, extra or fractional selections are rejected. Older API clients that omit registered lot IDs remain explicitly unlinked legacy material references; no stock deduction is invented for those records. Mandatory remediation of all legacy/unlinked paths is separate production work.

## Persistence and limits

SQLite adds scoped stock balance and immutable movement tables, with lot foreign keys, unique movement version per lot and optimistic balance updates. Scope checks and existing transaction serialization cover two connections. Packaging additionally requires consumable read/write permissions before repository access. The preview fixture is operator-only, creates a fresh fictional lot, and adds no stock until the owner confirms the receipt.

Developer November 10, 2026: 392 scoped tests passed (211 domain, 138 HTTP/SQLite, 43 web), scoped builds and Chromium receipt/packaging/refresh/reviewer quarantine/disposal passed. Checks cover quantity validation, missing receipts, conservation, idempotency, stale versions, source scope/roles/CSRF, multi-lot rollback, package-audit rollback, two-connection overspend prevention, immutable usage, trace facts, no restock on void and SQLite reopen. Chromium covers receipt confirmation, package usage and persistent balance after refresh.

Physical inventory reconciliation, adjustments/corrections, quarantine release, unit conversions, reservations before package save, supplier purchasing, stock valuation, cross-lot replenishment planning, barcode stock receipts, production migrations/indexes/scale, full manual operational and clinical acceptance remain deferred. RSP-ISS-001 remains parked.

Per-lot minimum-stock settings and current dashboard stock/expiry alerts are now delivered. See [CONSUMABLE-ALERTS.md](CONSUMABLE-ALERTS.md) for the current U-CONS-04 owner check.
