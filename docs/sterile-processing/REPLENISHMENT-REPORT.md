# Replenishment report and CSV

**Consumable lots → Replenishment report → Generate replenishment report** produces a read-only facility snapshot of all registered low-stock lots, including rows beyond the catalogue's first page. Withdrawn lots and lots without configured minimums are excluded. Low stock means recorded available stock at or below minimum, unchanged from the dashboard.

Rows show exact lot code, product/type, manufacturer lot, supplier/reference, available quantity, minimum, optional target, suggested quantity, inclusive UTC expiry day and planning status. Missing stock receipts are identified. Expired lots remain visible for separate replacement review with no suggestion; missing targets are labelled and export a blank suggestion. Suggestions retain existing whole-item, per-lot rules. There is no grand total across potentially different products or suppliers, order creation, reservation or stock movement.

Data is read in one scoped repository transaction with one UTC snapshot time. Supplier/code/ID sorting is stable. The screen displays fifty rows per page; CSV exports **all** rows of the displayed report. Generating again updates the snapshot. Stock or policy changes after generation do not silently change the displayed report or CSV. On a failed regeneration, the prior snapshot remains visible with its original time and an error.

CSV uses stable English keys, UTF-8 BOM, RFC 4180 quoting, CRLF records, scope/time/unit columns and spreadsheet formula neutralization. Null targets/suggestions remain blank. Empty reports export headers only. Open stock record resolves the exact lot ID with scope and identity checks; it loads current stock, which may differ from the report snapshot.

GET `/consumables/replenishment` requires `consumables:read`, rejects query parameters and returns a complete report. Existing local preview operator/reviewer/auditor read roles can view/export. No new permission or mutation is introduced.

## One owner check — U-REPLENREPORT-01 pending

After update/restart, **Consumable lots → Replenishment report → Generate replenishment report → Export replenishment CSV**. Expect a downloaded `ruby-replenishment-YYYY-MM-DD.csv` containing supplier, available, target and suggested quantity columns. The previously checked example should show target 20/suggestion 15 if its stock has not changed. This is the only owner check; no new fixture or stock decision is required.

## Verification and deferred work

Developer November 10, 2026: 418 scoped tests (219 domain, 149 HTTP/SQLite, 50 web), builds and Chromium verify supplier/target/suggestion display, CSV download of the displayed snapshot after a later receipt, regeneration and exact stock links. Automated checks cover fifty-row page boundaries, scope, no-write behavior, missing targets, expiry and safe CSV text. U-REPLEN-01 passed from the owner's dashboard screenshot. U-REPLENREPORT-01 remains pending.

Regional spreadsheet import, large production datasets/streaming, product grouping, cross-lot ordering, purchasing integration, pack conversion and site planning policy remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
