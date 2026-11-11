# Current consumable stock balance report

**Consumable lots → Stock balance report → Generate stock balance report** creates a read-only facility snapshot with one row per registered lot, across all catalogue pages. Rows include product/type, exact lot/manufacturer lot, supplier/reference, inclusive UTC expiry, total received, used, quarantined, discarded, signed net adjustments, available and usable quantities, stock version and last stock movement time.

Usable stock follows existing new-packaging stock rules: an expired or withdrawn lot has zero usable stock while retaining all recorded balances. The expiry day itself remains usable through that UTC day. Withdrawal takes precedence in the status label; a separate withdrawn flag and expiry date preserve both facts. Untracked lots are included with **No stock receipt recorded**, recorded zero quantities, null stock version/time and stock_recorded=false. These zero fields describe absence of a ledger, not a physical stock count. No stock records are fabricated.

For tracked lots, `received + net adjustments = available + used + quarantined + discarded`. The report preserves signed adjustments and historical received totals. Used, quarantined and discarded quantities are already excluded from available stock. Current status means within recorded expiry, not a new release/clinical decision. Earlier package evidence, receipts and other stock workflows remain unchanged.

All rows are read in one scoped transaction using one UTC snapshot time. Rows sort by exact lot code and ID. The screen displays fifty rows per page; CSV exports **every** row from the displayed snapshot. A later stock movement does not change an existing snapshot or its CSV. Generate again to refresh; on failure, the earlier snapshot remains visible with its original time and an error. Open stock record loads the exact lot's current state, which may differ from the snapshot. No grand total across different products is presented.

GET `/consumables/balance-report` requires existing `consumables:read`, accepts only optional exact lot-code and recorded-status filter parameters and preserves tenant/facility scope. Existing local operator/reviewer/auditor read roles can view and export. The client validates lot identities, ledger presence, numeric balances/conservation and expiry/withdrawal usability. CSV includes scope, snapshot, units, source IDs and ledger status, uses UTF-8 BOM/CRLF/quoted fields, neutralizes spreadsheet formulas and leaves null version/time blank. Empty reports export headers only.

## One owner check — U-STOCKBAL-01 passed November 11, 2026

After update/restart, **Consumable lots → Stock balance report → Generate stock balance report → Export stock balances CSV**. Confirm the download contains received, used, quarantined, discarded, net_adjustments, available and usable columns, one row per lot. The previously checked count lot should retain received 10/net adjustment −2/available 8 if its stock has not changed. This is the only owner check; no fixture or stock change is required.

## Verification and deferred work

Developer November 11, 2026: 431 scoped tests (224 domain, 152 HTTP/SQLite, 55 web), builds and Chromium verify full balances, signed adjustment, untracked lots, frozen CSV after a later receipt, regeneration and exact stock-record navigation. Automated tests cover conservation, expiry day, expired/withdrawn balances versus usability, missing-ledger fields, complete pagination, scope, read-only behavior, role/query validation and SQLite reopen. U-STOCKFILTER-01 passed from the owner's uploaded filtered CSV; U-STOCKBAL-01 passed November 11, 2026 from the uploaded seven-lot balance CSV.

Physical verification, historical backfill, production-scale indexing/streaming, multi-unit conversions, product/location totals, regional spreadsheet import and broader site policy remain deferred. Reuse of stock/reporting foundations in future Ruby Asset Management remains intended; no Asset module is implemented. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.


Exact lot-code and recorded-status filters are now available. See [STOCK-BALANCE-FILTERS.md](STOCK-BALANCE-FILTERS.md) for applied-snapshot and CSV behavior and the current owner check.
