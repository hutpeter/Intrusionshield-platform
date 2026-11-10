# Dated consumable stock movement report

**Consumable lots → Stock movement report** provides a read-only snapshot of recorded receipts, package usage, quarantine, disposal and approved count adjustments. Set **From day (UTC)** and **Through day (UTC)**, then **Generate stock movement report**. Both displayed days are inclusive; the API uses an exclusive next-day end. The default is seven UTC days, with a maximum ninety-day range ending no later than today. Invalid calendar dates, reversed/empty periods, duplicate or unknown query fields are rejected.

Rows show recording time, exact lot, action, movement quantity, change in available stock, saved available/quarantined/used/discarded balances, stock version, product/manufacturer lot/supplier, linked package or stock count, reason/evidence and actor. Movement quantity is positive for normal operations and signed for count adjustments. Quarantined disposal changes available stock by zero. Zero-difference count approval creates no movement and is therefore absent. Earlier untracked usage is not invented; package voiding does not fabricate a return to stock.

The report includes expired and withdrawn lots' recorded history. Balance columns come from the original movement snapshot, rather than today's balance. It is not an opening/closing balance statement and does not sum different products into one inventory total. Existing stock ledgers, clinical gates, decisions and earlier package evidence are unchanged.

The repository reads all catalogue and movement pages in one scoped transaction. Rows sort by UTC timestamp, lot code, stock version and movement ID. The UI displays fifty rows per page; **Export stock movements CSV** exports every row in the displayed snapshot. Editing dates does not change that snapshot or the exported period until generation succeeds. Failed generation retains the prior snapshot and shows an error. Source links load the exact lot's current stock and may differ from historical balances.

The GET `/consumables/movement-report?from=YYYY-MM-DD&to=YYYY-MM-DD` endpoint uses existing `consumables:read`. Tenant/facility scope, row and balance identity, period and signed-delta checks apply. Local operator/reviewer/auditor roles retain read access. CSV uses stable English keys, scope/period/snapshot columns, UTF-8 BOM, CRLF, quoted fields and spreadsheet formula neutralization. Negative numeric cells are text-escaped for spreadsheet safety. Empty reports export headers only.

## One owner check — U-STOCKHIST-01 pending

Update/restart, then **Consumable lots → Stock movement report → Generate stock movement report → Export stock movements CSV**. Use the default seven-day period. Confirm the downloaded CSV includes action, quantity, available change, available after, reason/evidence and actor columns. Earlier checked receipts/adjustments should be present if recorded in that period. No new fixture or stock change is required. This is the only owner check.

## Verification and deferred work

Developer November 10, 2026: 423 scoped tests (221 domain, 150 HTTP/SQLite, 52 web), builds and Chromium verify receipt/adjustment rows, saved balances, signed CSV, frozen snapshot after editing date inputs and exact stock-record links. Automated tests cover all six actions, withdrawal history, immutable balances, UTC start/end, invalid periods, both catalogue/movement page boundaries, no writes, scope, response validation and SQLite reopen. U-REPLENREPORT-01 passed from the owner's CSV confirmation. U-STOCKHIST-01 remains pending.

Physical stock verification, historical backfill, production-scale indexing/streaming, movement correction workflows, regional spreadsheet import and site inventory policy remain deferred. Ruby Asset Management reuse remains intended without implementing that module. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
