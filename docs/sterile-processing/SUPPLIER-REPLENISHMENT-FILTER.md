# Supplier filter for replenishment

Replenishment report now offers Supplier filter, default All suppliers. Generate loads the existing scoped snapshot and its recorded supplier names. Choosing a supplier filters that saved snapshot immediately, resets to page one and applies to both By supplier and All lots, CSV and print. There is no source query on selection; Generate refreshes the underlying data. Matching is exact, preserving case/spacing variants. The screen shows the selected supplier, matching lot count, source snapshot lot count and suppliers in view.

A selected supplier that disappears from a later snapshot remains selected with an explicit empty result. It is not silently widened to All suppliers. Choosing All suppliers restores all snapshot rows. Existing stock rules, per-lot suggestion/blank/expired semantics, permissions and source links remain unchanged.

CSV exports all matching rows beyond the current page, preserving scope/time/unit and values. A new final filter_supplier column carries the selected name (blank means All suppliers); filtered filenames include filtered-. Empty results export headers only. Both grouped and flat CSV use the selection. Print receives only matching records and adds Supplier filter to metadata, including when empty. The original generated timestamp remains intact.

Saved replenishment presets can retain optional supplier text (nonblank, at most 200 characters). Old presets without it continue to mean All suppliers. Edit/update, run and portable JSON transfer preserve the exact selection; import review shows it. The current version 1 format accepts this optional field, while older builds may reject files with unsupported fields and should be updated before import. A preset run still fetches fresh scoped stock data and then applies its saved supplier. Layout preference is not persisted.

## Developer verification — November 12, 2026

80 web tests and the web build passed. New tests cover exact filtering beyond fifty rows, immutable snapshots, absent/All suppliers, per-lot states, CSV filter metadata/escaping, legacy and supplier-specific preset validation, bounds and portable round trips. Chromium covered live filtering/source links, a 54-lot/three-supplier snapshot, page reset, case-distinct suppliers, a 51-lot export/print with filter metadata beyond the screen page, no source refetch, flat/group view, preset save/run/export, missing supplier on regeneration with header-only export, All suppliers reset and ES/FR/mobile. Existing grouping, preset editing and transfer/import regressions passed. Screenshot inspected. No stock writes or browser errors. Backend unchanged; preceding 228 domain and 155 HTTP/SQLite tests were not rerun for this UI-only feature.

## One owner check — U-SUPPLIERFILTER-01 pending

Reports hub → Replenishment report → Generate replenishment report → Supplier filter: DEMO-SUPPLIER → Export supplier replenishment CSV. Confirm rows belong to DEMO-SUPPLIER and the CSV filter_supplier value is DEMO-SUPPLIER. This is the only owner check for this build; no stock mutation is needed.

U-SUPPLIERREPLEN-01 passed from the owner's November 12 screenshot: one supplier, two lots, suggested quantity 15 and an unset-target blank, snapshot 2026-11-12T13:56:50.960Z. Supplier catalog identity, multi-select, cross-product totals, purchasing, server-side filtered querying and production scale remain deferred. Future Ruby Asset Management reuse remains intended; U-TRACE-01 and original U-LOANER-01 remain unconfirmed and RSP-ISS-001 stays parked.
