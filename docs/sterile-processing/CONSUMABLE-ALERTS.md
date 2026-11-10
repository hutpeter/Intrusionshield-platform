# Consumable stock and expiry alerts

## One owner check: U-CONS-04 (passed November 10, 2026)

Owner screenshot confirms saved alert settings with minimum 10 and warning 7. Original check: update/restart the preview and enter as **Demo reviewer**. Open **Consumable lots → Prepare fictional stock alert example**. This prepares a new fictional lot with five items expiring in three UTC days and opens settings with **Minimum stock: 10** and **Expiry warning days: 7**. Review the prefilled reason/reference, tick **I confirm these stock alert settings.**, then **Save alert settings**. Expect **Alert settings saved.**, Minimum stock **10** and Expiry warning days **7**. This is the only owner check. Dashboard classification, permissions, paging, links and refresh are developer-verified.

## Rules

- Low stock means recorded available items **at or below** the configured minimum. The threshold is per exact registered lot and uses the existing whole-item `each` unit. Minimum 0 is valid and alerts at zero; a blank/null minimum disables low-stock alerts for that lot. No minimum is invented for older lots.
- A configured lot without a stock receipt can have a low-stock alert at recorded balance zero. The row explicitly indicates that no receipt is recorded; it is not a verified physical count.
- Expiry alerts cover **positive available balances**, using the inclusive UTC expiry day. With warning 7, expiry exactly seven UTC calendar days away is included; eight days away is excluded. The expiry day itself is approaching expiry; the following UTC day is expired. Already expired positive stock remains visible as **Expired stock**. Quarantined/used/discarded quantities do not generate expiry alerts.
- The default expiry warning is seven days when no settings exist. Reviewers can configure 1–365 days. Withdrawn lots are excluded from this queue and retain their existing withdrawal/recall controls.
- A lot can show low stock and approaching/expired stock together. It counts once. The row shows available items, minimum and expiry day. These are snapshots; refresh the dashboard after receipts, consumption, quarantine/disposal, threshold edits or withdrawal. No email, notification, purchasing, reservation or new workflow block is created by these alerts.

## Settings and navigation

Reviewers configure settings with reason, policy/evidence reference and confirmation through `consumables:policy`. Settings use the current lot version, command idempotency and an atomic audit. Stale versions, withdrawn lots, invalid/non-whole minimums and invalid warning ranges are rejected. The current settings are saved on the lot; saved command receipts retain prior decision results. Stock balances and earlier package evidence are unchanged.

The **Operational dashboard** includes **Consumable stock and expiry alerts**, protected by `consumables:read` in addition to dashboard read permission. Denied sources are not queried and their totals remain hidden. Pagination returns exact scoped totals and twelve rows, sorted by expiry day, code and ID. Both initial and paged responses validate alert metadata in the client.

**Open record** opens that exact lot's **Stock and movements**, including lots beyond the first catalogue page. **Open workspace** opens the lot catalogue. The stock panel shows current minimum/warning settings and expiry. Normal roles and stock/expiry/withdrawal gates still apply.

The reviewer-only fictional helper prepares lot/stock prerequisites but does not save the alert settings. Production authentication, site approval, supplier/product grouping, cross-lot reorder totals, purchasing integration, stocktake corrections, push notifications, physical reconciliation, large-scale indexing/migration and broader manual/clinical acceptance remain deferred. RSP-ISS-001 stays parked.

Developer November 10, 2026: 398 scoped tests passed (213 domain, 141 HTTP/SQLite, 44 web), scoped builds and Chromium confirmed settings, combined low-stock/expiry dashboard metadata, exact record navigation and refresh passed. Coverage includes UTC boundaries, zero/unrecorded stock, withdrawn exclusion, replenishment, null threshold, read permissions, role/CSRF checks, stable pagination, scope, stale settings, audit rollback and SQLite reopen. U-CONS-04 subsequently passed from the owner screenshot.


Replenishment targets and suggested quantities are now available through the existing stock alert settings/example. See [REPLENISHMENT.md](REPLENISHMENT.md) for the current U-REPLEN-01 owner check and calculation rules.
