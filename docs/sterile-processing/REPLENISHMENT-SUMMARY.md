# Replenishment status summary counts

After generating Replenishment report, Planning status summary shows Suggested lots, Target not set and Expired lots. These are lot counts, not suggested item quantities. They follow the exact supplier selection and include every page of the saved snapshot across all planning statuses. The note explicitly explains that the table additionally applies Planning status filter. Thus selecting Target not set narrows the table while the summary still shows that supplier's complete status distribution.

Classification uses each row's existing planning_status. Expired takes the server's precedence even when its target is missing; counts do not reclassify rows by target/null fields. Empty snapshots or absent selected suppliers show three zeros. Before generation no summary is shown. Supplier changes recompute locally without a source query; generation replaces the source snapshot/counts. Paging, display mode and planning-status selection do not change the summary's scope.

The table, full CSV and print retain their combined supplier/status filters and per-lot quantities. The summary is a screen overview and adds no CSV columns or print data. Preset/portable-file schemas, permissions, backend stock rules and source links are unchanged. EN/ES/FR labels and responsive cards are included.

## Developer verification — November 12, 2026

87 web tests and the web build passed. New tests cover full counts beyond fifty lots, exact supplier names, per-lot rather than quantity counting, status precedence, immutability and explicit zero states. Chromium checked the live snapshot against its response plus a 60-lot/three-supplier fixture, every-page counts, supplier changes, count stability across table status filters and flat/group views, empty intersections, unchanged filtered CSV/print, no refetch, fresh generation, missing/empty suppliers and ES/FR/mobile. Existing planning-status/preset/transfer regression checks passed. Screenshot inspected. No stock writes or browser errors. Backend unchanged; preceding 228 domain and 155 HTTP/SQLite suites were not rerun for this UI-only feature.

## One owner check — U-REPLENSUMMARY-01 passed November 12, 2026

Reports hub → Replenishment report → Generate replenishment report. Keep All suppliers and All statuses. Confirm the three summary counts against the displayed lots. For the current November 12 two-lot demo: Suggested lots 1, Target not set 1, Expired lots 0. This is the only owner check; no CSV or stock movement is requested.

U-REPLENSTATUS-01 passed November 12 from the uploaded one-row combined-filter CSV. Summary export/print, supplier identity, purchasing, cross-product totals, server-side aggregation and production scale remain deferred. Ruby Asset Management reuse remains intended; U-TRACE-01/original U-LOANER-01 remain unconfirmed and RSP-ISS-001 stays parked.

Owner screenshot November 12, 2026 confirms U-REPLENSUMMARY-01: All suppliers / All statuses, two lots and one supplier, summary Suggested lots 1 / Target not set 1 / Expired lots 0, snapshot 2026-11-12T19:36:24.435Z. Counts agree with the visible lot statuses. Other pending acceptance and deferred items remain unchanged.


## Summary cards apply status filters — November 12, 2026

Suggested lots, Target not set and Expired lots are now native buttons. Activating one sets the existing planning-status selection and resets the table to page one, preserving the supplier. The selected card uses aria-pressed and a visible border/background. Mouse, Enter and Space are supported; cards are disabled during source loading or a blocked session. Zero-count cards remain selectable and show the existing explicit empty result. Selecting an already active card keeps the same filter; All statuses clears it. Counts still cover the selected supplier's full snapshot across all statuses/pages.

CSV, print and saved/portable preset definitions use the same planningStatus state, so they follow the card selection without any schema or source API change. No query or stock movement is triggered by a card click. Existing dropdown changes also update the selected card. EN/ES/FR notes explain the action and clearing it.

87 web tests and the preview build passed. Chromium checked live cards and a 55-lot read fixture, mouse/Enter/Space, dropdown/pressed synchronization, supplier retention, page reset, stable counts/no refetch, zero-count/empty results, All statuses clearing, grouped/flat views, CSV/print/preset runs and disabled controls while a request was held pending. Localization/mobile and existing planning-filter/preset/transfer regression checks passed. Screenshot inspected. No stock writes or browser errors. Backend unchanged; previous domain/HTTP suites were not rerun for this UI-only interaction.

Single owner check U-REPLENCARD-01 passed November 12, 2026: Reports hub → Replenishment report → Generate → Supplier filter DEMO-SUPPLIER → click the Target not set summary card. Expect that card highlighted, the status dropdown set to Target not set and one matching demo lot, with DEMO-SUPPLIER retained. This is the only owner check; no export or stock mutation requested. Summary export/print, purchasing and server aggregation remain deferred; prior unconfirmed items and RSP-ISS-001 remain unchanged.

Owner screenshot November 12, 2026 confirms U-REPLENCARD-01: DEMO-SUPPLIER retained, Target not set card highlighted and status dropdown synchronized, one matching lot with blank suggestion, summary counts 1/1/0, snapshot 2026-11-12T19:53:40.538Z. Other pending acceptance and deferred items remain unchanged.
