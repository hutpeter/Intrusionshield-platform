# Consumable replenishment suggestions

Reviewers can set an optional **Replenishment target** alongside the existing minimum and expiry warning settings. It uses whole individual items, is bounded at one billion, and must be at least the minimum. A target requires a minimum. Blank/null disables suggestions; older settings without a target keep their existing alert behavior. Saving the full policy without a target clears it. Existing version, reviewer permission, confirmation, CSRF, idempotency and atomic audit rules apply.

For an eligible low-stock lot (available at or below minimum), **Suggested replenishment** is `max(0, target − available)`. The dashboard shows the target and suggestion. This uses recorded available stock; quarantine/disposal are already excluded. A lot without a receipt uses recorded zero and retains its no-receipt notice. Suggestions are suppressed after the inclusive UTC expiry day and for withdrawn lots. Expiry alerts retain their existing behavior.

The suggestion updates on dashboard refresh after receipts, consumption, adjustments or policy changes. It is per exact registered lot, not a supplier/product order total. It creates no purchase order, reservation or stock movement. Purchasing and replacement of expired lots remain separate decisions. A higher target alone does not trigger an alert when stock is above minimum.

## One owner check — U-REPLEN-01 pending

Update/restart and enter as **Demo reviewer → Consumable lots → Prepare fictional stock alert example**. Review the prefilled minimum **10**, target **20** and simulated reason/reference, confirm and **Save alert settings**. Open **Operational dashboard** and find the new lot under **Consumable stock and expiry alerts**. Expect **Replenishment target: 20 · Suggested replenishment: 15** (available 5). Codes vary. This is the only owner check for this build.

## Verification and deferred work

Developer November 10, 2026: 413 scoped tests (218 domain, 148 HTTP/SQLite, 47 web), builds and Chromium verified policy saving, target/suggestion display, exact source navigation and refresh. Tests cover invalid bounds, optional/cleared targets, stock updates, expiry/withdrawal exclusion, scope/role/CSRF, retries and persistence. U-REVIEWQ-01 is passed from the owner screenshot; U-REPLEN-01 remains pending.

Product-level grouping, target approval policy at sites, cross-lot planning, lead times, order rounding, pack conversions, purchasing, notifications, physical verification and production/clinical acceptance remain deferred. Reuse of stock alerts/count review/replenishment for future Ruby Asset Management remains intended; no Asset module is added. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
