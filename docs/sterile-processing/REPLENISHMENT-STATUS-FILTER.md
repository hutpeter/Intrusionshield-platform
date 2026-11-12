# Replenishment planning-status filter

Replenishment report offers Planning status filter: All statuses (default), Replenishment suggested, Target not set and Expired — review replacement separately. It intersects with the exact supplier filter on the generated snapshot. Both grouped and flat views update immediately, return to page one and retain the source snapshot timestamp/count. No source read is made until Generate. Choices remain selected if regeneration produces an empty intersection; clearing a choice explicitly restores the broader view.

CSV contains every matching lot across pages, adding a final filter_planning_status column with canonical suggested/target_not_set/expired, or blank for All statuses. filter_supplier remains present. Filtered filenames include filtered- when either selection narrows the view. Empty exports contain headers only. Print receives matching records and both translated filter labels in metadata. Underlying per-lot target/suggestion/expired semantics are unchanged; the frontend does not invent missing suggestions or alter planning classifications.

Saved replenishment presets now optionally retain planningStatus as well as supplier. Legacy definitions with neither field or supplier alone remain valid and mean All statuses. Edit/update, fresh preset runs, portable JSON and readable import review preserve both selections. Invalid/empty status values and unknown fields are rejected. The current version 1 format supports this optional field; older builds may reject files containing unsupported fields and should be updated before import. Storage remains browser/user/facility scoped. EN/ES/FR labels are included.

## Developer verification — November 12, 2026

84 web tests and the web build passed. New tests cover status/supplier intersections, All/empty combinations, immutable snapshots, missing and expired values, 52 matching CSV rows beyond the screen page, canonical metadata and legacy/combined preset validation/transfer. Chromium exercised live combined filtering and a live source-lot link, a 55-lot read fixture, all status options, page reset, a full 52-lot filtered CSV/print, blank target/suggestion values, empty intersections/header-only export, clearing filters, no refetch, flat/group views, preset create/edit/run/portable review, empty regeneration retention, ES/FR/mobile and existing supplier/edit/transfer regressions. Screenshot inspected. No stock writes or browser errors. Backend unchanged; prior 228 domain and 155 HTTP/SQLite suites were not rerun for this UI-only feature.

## One owner check — U-REPLENSTATUS-01 pending

Reports hub → Replenishment report → Generate replenishment report → Supplier filter: DEMO-SUPPLIER → Planning status filter: Target not set → Export supplier replenishment CSV. Expect target_not_set rows only, filter_supplier DEMO-SUPPLIER and filter_planning_status target_not_set; target/suggested quantity stay blank. This is the only owner check; no stock mutation is requested.

U-SUPPLIERFILTER-01 passed November 12 from the uploaded two-row CSV. Supplier catalog identity, multi-select, purchasing, cross-product totals, server-side filtering, broader manual acceptance and production scale remain deferred. Ruby Asset Management reuse remains intended; U-TRACE-01/original U-LOANER-01 remain unconfirmed and RSP-ISS-001 stays parked.
