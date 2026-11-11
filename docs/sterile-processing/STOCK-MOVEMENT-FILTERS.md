# Stock movement report filters

The existing dated report now accepts an optional **Exact lot code** and **Movement type**. Blank code means all lots; the default type is all movements. Codes use existing trim/NFC/uppercase normalization and match the complete registered lot code, not a prefix or manufacturer lot number. The text field suggests codes from the displayed snapshot but permits other exact codes. It does not depend on the catalogue's first page or a capped dropdown.

Both filters intersect with the UTC period and apply before display pagination. A scoped exact-code lookup selects one lot when provided; other lots' movements are not loaded. Unknown codes return an empty snapshot. All six existing actions are selectable. Filtered history retains saved balances, original reasons/evidence and package/count links. It does not recalculate historical balances from only the selected action type.

**Generate stock movement report** applies edited dates/filters. The displayed snapshot explicitly shows its **Applied filters**. **Clear filters** resets the inputs to all lots/types and requires generation to replace the displayed report. Before generation, CSV continues exporting the previous snapshot and its applied filters. A failed generation retains that prior snapshot with an error. Source navigation, permissions and fifty-row display pagination remain unchanged.

The API adds optional `lotCode` and `action` query parameters. Unknown keys, duplicated values, invalid lot codes and unsupported actions are rejected. Omitted filters preserve unfiltered behavior. Responses record canonical filters; client checks reject mismatched filters or out-of-filter rows. CSV appends `filter_lot_code` and `filter_action` columns to every exported row. It includes every matching snapshot row across display pages. Empty reports export headers only.

## One owner check — U-STOCKFILTER-01 passed November 11, 2026

After update/restart, **Consumable lots → Stock movement report → Movement type: Approved count adjustment → Generate stock movement report → Export stock movements CSV**. Leave the lot field blank and use the default seven-day period. Expect only approved adjustment rows in the report and `action=adjustment` / `filter_action=adjustment` in CSV. The prior −2 adjustment should be present if within the selected period. This is the only owner check; no new stock movement is required.

## Verification and deferred work

Developer November 10, 2026: 426 scoped tests (222 domain, 151 HTTP/SQLite, 53 web), builds and Chromium verify exact lot/type intersection, canonical applied filters, filtered CSV, unchanged snapshot after input edits and clear/regenerate restoring all movements. Tests cover exact-versus-prefix codes, unknown codes, invalid/duplicate query values, scope, saved balances and no source writes. U-STOCKHIST-01 passed from the owner's supplied movement CSV; U-STOCKFILTER-01 passed November 11, 2026 from the uploaded filtered movement CSV.

Physical stock verification, manufacturer-lot/product/supplier grouping, multi-select/action totals, production-scale indexing/streaming and broader regional spreadsheet acceptance remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
