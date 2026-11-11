# Stock balance report filters

The current balance report now accepts **Exact lot code** and **Recorded status**, defaulting to all lots and all statuses. Lot codes use the existing trim/NFC/uppercase normalization and match the complete registered code, not a prefix or manufacturer lot. The text field suggests codes from the displayed snapshot and permits other exact codes without relying on a capped catalogue dropdown.

Filters intersect before display pagination. An exact code uses a scoped source lookup and does not load other lots' stock. Unknown codes return an empty snapshot. Unfiltered behavior remains the same. Read permissions and the conservation/usable-stock rules remain unchanged; filtering never recalculates or edits quantities.

Recorded statuses are exclusive, using the existing priority: **Withdrawn**, otherwise **Expired** when past the inclusive UTC expiry day, otherwise **No stock receipt recorded** (untracked), otherwise **Within recorded expiry** (current). Thus the untracked status filter excludes lots already classified as withdrawn/expired, even if their `stock_recorded` flag is false. That separate flag and expiry/withdrawal fields remain in the export. Current status does not imply a clinical release or positive stock quantity.

**Generate stock balance report** applies edited filters and displays the canonical **Applied filters**. **Clear filters** resets inputs to all lots/statuses but does not replace an existing snapshot until generation. CSV exports every row of the displayed snapshot, across fifty-row display pages, and appends `filter_lot_code` and `filter_status`. Input edits and failed generation do not silently change exported data; empty reports export headers only.

GET `/consumables/balance-report` accepts only optional `lotCode` and `status`. Missing parameters mean all. Invalid/blank supplied codes, unsupported/blank statuses, duplicate values, wrong types and unknown query fields are rejected. Responses record canonical filters, and client checks reject mismatched filters or out-of-filter rows. No migration, stock change or new permission is introduced.

## One owner check — U-BALFILTER-01 pending

Update/restart, then **Consumable lots → Stock balance report → Recorded status: Withdrawn → Generate stock balance report → Export stock balances CSV**. Leave the exact lot code blank. Expect only withdrawn rows; CSV `recorded_status` and `filter_status` should both be `withdrawn`. The previously checked withdrawn lot should remain usable 0. This is the only owner check; no new stock movement is requested.

## Verification and deferred work

Developer November 11, 2026: 434 scoped tests (225 domain, 153 HTTP/SQLite, 56 web), builds and Chromium verify exact lot/status intersection, canonical filters, unchanged quantities, frozen CSV after edits/clear, regeneration and empty results/export. Tests cover all status classes and priority, exact-versus-prefix codes, complete pagination, scope, strict queries, response validation and no writes. U-STOCKBAL-01 passed from the owner's uploaded seven-lot CSV. U-BALFILTER-01 remains pending.

Physical verification, separate ledger-presence filters, multi-select status, manufacturer/product/supplier grouping, production-scale querying and wider regional spreadsheet acceptance remain deferred. Future Ruby Asset Management reuse remains intended; no Asset module is added. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
