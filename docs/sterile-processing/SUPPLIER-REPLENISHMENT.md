# Supplier-based replenishment view

Replenishment report defaults to Report view: By supplier. Generate retrieves the existing scoped low-stock snapshot. Supplier headings group lots by exact recorded supplier name, with each lot's suggested quantity and planning status beside its product. Product/lot identity, manufacturer lot, supplier reference, available/minimum/target, expiry and source links remain available. Suppliers in snapshot counts distinct recorded names across the entire report. Similar spellings/case/spacing are not merged into an assumed supplier identity.

Suggested quantities remain per lot. Missing targets and expired statuses remain visible with blank suggestions as supplied by the server. No product/lot quantity totals or purchases are created. All lots restores the existing flat table and its column order. Switching views uses the saved snapshot without a source query and returns to page one. The fifty-lot page size remains; a supplier spanning pages repeats its heading, while the supplier count describes the full snapshot. EN/ES/FR labels are supported.

Export supplier replenishment CSV writes the full saved snapshot, sorted by supplier then lot code/ID, including every lot beyond the screen page. It retains the existing CSV columns, scope, generatedAt, unit, per-lot quantities/status, spreadsheet escaping and blank values. Filename: ruby-replenishment-by-supplier-YYYY-MM-DD.csv. All lots retains the classic CSV button/filename and source order. Existing Print report / save PDF still prints the complete saved lot report. No API, stock rules, report permissions or preset/file schema changes. Presets continue to rerun the existing replenishment request; the initial report layout is By supplier.

## Developer verification — November 12, 2026

76 web tests and the web build passed. New tests cover exact supplier names including case/spacing variants and prototype-like text, stable lot ordering without source mutation, differing products' separate suggestions, missing/expired statuses, all 53 CSV rows, scope/time/unit, empty data and spreadsheet-safe text. Chromium exercised live generation and an exact live lot source link, then a 53-lot/three-supplier read fixture spanning pages. Checks covered repeated group headings, full CSV/print snapshots, per-lot blank targets/suggestions and expired status, literal HTML-like supplier names, view switching without refetching, original flat CSV, empty regeneration and ES/FR/mobile layout. Existing preset create/edit/rename/run regressions passed. Screenshot inspected. No stock writes or browser errors. Backend unchanged; prior 228 domain and 155 HTTP/SQLite suites were not rerun for this UI-only feature.

## One owner check — U-SUPPLIERREPLEN-01 passed November 12, 2026

Reports hub → Replenishment report → Generate replenishment report. Keep Report view: By supplier. Confirm supplier headings and each lot's own suggested quantity/planning status. This is the only owner check; developer tests cover CSV and other views. No stock mutation is needed.

Supplier catalog identity, consolidation across lots/products, purchasing workflows, grouping filters, persisted layout preferences and production-scale querying remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.

Owner screenshot November 12 confirms U-SUPPLIERREPLEN-01: one DEMO-SUPPLIER group, two lots, suggested 15 and an unset-target blank, snapshot 2026-11-12T13:56:50.960Z. Supplier selection, filtered exports and saved supplier presets are now documented in [SUPPLIER-REPLENISHMENT-FILTER.md](SUPPLIER-REPLENISHMENT-FILTER.md); its export metadata update supersedes the original CSV-column description above.
