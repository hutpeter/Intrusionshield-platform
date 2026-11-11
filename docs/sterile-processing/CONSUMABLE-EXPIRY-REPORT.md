# Consumable expiry report and CSV

**Consumable lots → Consumable expiry report → Generate expiry report** provides a current facility snapshot of expired lots plus lots expiring within a selected UTC horizon. The default is thirty days; valid horizons are whole numbers from one through 365. This is a report range and does not change per-lot stock alert policies.

Only lots with positive **recorded available or quarantined stock** are included. Quarantine-only lots remain visible. Lots with no ledger, or only used/discarded stock, are excluded. Withdrawn lots with outstanding recorded stock remain included and explicitly flagged; their usable quantity remains zero. This broader review scope differs from dashboard expiry alerts, which use per-lot warning days and available stock only.

The report reuses one atomic stock balance snapshot. Every row retains exact lot/manufacturer lot, product/type, supplier/reference, available, quarantined, usable, withdrawal flag, stock version and last movement time. It adds inclusive expiry day, signed days to expiry and expired/expiring classification. Negative days mean already expired; zero means expiry today, still within the recorded expiry day. The exact horizon day is included; one day beyond is excluded. Existing expiry/withdrawal/packaging gates and balances are unchanged. Expiry status remains independent of withdrawal, with both facts shown.

Rows sort by expiry day, lot code and ID. All matching lots are included across catalogue pages; the UI displays fifty per page and CSV exports **all** rows from the displayed snapshot. Editing the horizon does not replace that snapshot until generation succeeds. A failed generation retains the old report with an error. Open stock record loads the exact lot's current state. There are no automatic notifications, disposal, replenishment orders or physical stock verification.

GET `/consumables/expiry-report` uses existing `consumables:read`, accepts optional `days` (default 30), exact `lotCode` and expiry `status`, and rejects duplicate, fractional, out-of-range, noncanonical or unknown query values. Tenant/facility scope remains enforced. The client checks scope, horizon/as-of/through-day, days-to-expiry, status, positive available/quarantine stock, balance conservation and usable restrictions. CSV records scope, snapshot, UTC horizon, source IDs and quantities with UTF-8 BOM/CRLF/quoted fields and spreadsheet-safe text. Empty reports export headers only.

## One owner check — U-EXPIRY-01 passed November 11, 2026

After update/restart, **Consumable lots → Consumable expiry report → Generate expiry report → Export expiry CSV**. Keep the default thirty-day horizon. Confirm `ruby-consumable-expiry-YYYY-MM-DD.csv` includes expiry_day_utc, days_to_expiry, expiry_status, available and quarantined columns. Existing positive alert-example lots should appear if they expire within the horizon. This is the only owner check; no fixture or stock change is requested.

## Verification and deferred work

Developer November 11, 2026: 439 scoped tests (227 domain, 154 HTTP/SQLite, 58 web), builds and Chromium verify default window, matching quantities, frozen CSV after horizon edits, changed-window generation and exact stock-record links. Automated tests cover expiry yesterday/today/exact horizon/beyond horizon, quarantine-only stock, withdrawn flags, used/discarded/untracked exclusion, complete pagination, strict inputs, scope, no writes, shared balance validation and SQLite reopen. U-BALFILTER-01 passed from the owner's uploaded withdrawn CSV; U-EXPIRY-01 passed November 11, 2026 from the uploaded two-lot expiry CSV.

Physical verification, regional spreadsheet import, production-scale streaming/indexing, product/location aggregation, multi-select expiry/status filters and proactive notifications remain deferred. Reuse of stock/reporting foundations for future Ruby Asset Management remains intended without implementing that module. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.


Optional exact lot-code and expiry-status filters are now available. See [CONSUMABLE-EXPIRY-FILTERS.md](CONSUMABLE-EXPIRY-FILTERS.md) for applied snapshot, clear behavior, CSV metadata and the current owner check.
