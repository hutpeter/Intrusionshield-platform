# Consumable expiry report filters

The expiry report now accepts **Exact lot code** and **Expiry status** alongside the existing UTC horizon. Blank code means all lots; status defaults to all expiry statuses. Codes match the complete registered code after trim/NFC/uppercase normalization, not a prefix or manufacturer lot. Suggestions come from the displayed snapshot and do not restrict manually entered exact codes or depend on catalogue page limits.

Filters intersect with the horizon and positive recorded available/quarantined-stock rules before display pagination. Exact code uses the existing scoped balance lookup and avoids loading other lots. Unknown codes and nonmatching combinations produce an empty snapshot. Expiry statuses are **Expired** (`expired`, negative days to expiry) and **Approaching expiry** (`expiring`, zero through the inclusive horizon day). Expiry status is independent of withdrawal: a withdrawn lot with outstanding stock can still match either expiry class, retains its flag and remains unusable. No quantities or source decisions are changed by filtering.

**Generate expiry report** applies input changes and displays canonical **Applied filters**. **Clear filters** resets the lot/status inputs only; it preserves the selected horizon. Until generation succeeds, the displayed snapshot and exported CSV remain unchanged. Failed generation retains the earlier snapshot with an error. Empty reports export headers only. Source links, scope and fifty-row display paging retain their existing behavior.

The GET endpoint adds optional `lotCode` and `status`; omitted filters retain unfiltered behavior. Invalid/blank codes, unsupported/blank expiry statuses, duplicated values, wrong types and unknown query keys are rejected. CSV appends `filter_lot_code` and `filter_expiry_status` while retaining the existing horizon metadata and all matching rows across display pages. The client validates canonical applied filters and rejects out-of-filter rows.

## One owner check — U-EXPFILTER-01 pending

After update/restart, **Consumable lots → Consumable expiry report → Expiry status: Approaching expiry → Generate expiry report → Export expiry CSV**. Keep thirty days and leave the lot field blank. Expect only `expiry_status=expiring` rows and CSV `filter_expiry_status=expiring`, with blank `filter_lot_code`. The previously checked November 13 examples should match while within the selected current window. This is the only owner check; no new stock movement is requested.

## Verification and deferred work

Developer November 11, 2026: 442 scoped tests (228 domain, 155 HTTP/SQLite, 59 web), builds and Chromium verify exact lot/status/horizon intersections, canonical applied filters, unchanged quantities, frozen CSV after edits/clear, regeneration, empty export and clear preserving the horizon. Tests cover exact-versus-prefix codes, withdrawal/quarantine semantics, complete pagination, scope, strict queries, source immutability and response validation. U-EXPIRY-01 passed from the owner's uploaded expiry CSV; U-EXPFILTER-01 remains pending.

Physical stock verification, multi-select status, manufacturer/product/supplier grouping, production-scale querying/streaming, regional spreadsheet import and notifications remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
