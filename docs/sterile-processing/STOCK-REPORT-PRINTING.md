# Printable stock report snapshots

All four stock reports now provide **Print report / save PDF**, enabled after successful generation. Printing uses the exact displayed report object, including saved filters/window, UTC generation time, scope, unit and total matching record count. Input edits, current display page and later stock changes do not alter that object. It does not fetch or regenerate data, save a new decision or change stock.

Wide reports print as compact per-lot or per-movement field tables rather than the horizontally scrolling screen grid. Every matching record is included, beyond fifty-row display pages. Long IDs, source text and evidence wrap; record sections avoid page splits when they fit. A named A4 landscape page style applies only to these reports. App navigation, controls, catalogue and pagination are hidden in the print view. Existing instrument/package label print styles remain separate.

The print header includes report title, snapshot time, tenant/facility IDs, optional facility name, units and record count. Balance filters, movement period/filters and expiry as-of/through/horizon/filters come from the saved snapshot. Empty reports print their metadata and empty-state message. Signed numbers print as numbers without CSV safety apostrophes; booleans and labels follow EN/ES/FR, and missing values show a dash.

Print content is built with DOM text nodes from typed report models. Supplied product names, reasons and evidence remain literal text. No HTML injection, popup window, remote service or new permission is needed. The native browser print dialog controls the destination, including **Save as PDF**. After print/cancel, the isolated tree is removed and the original document title restored. It stays hidden on screen while native print preview is active.

## One owner check — U-STOCKPRINT-01 passed November 11, 2026

Owner PDF confirmed the title, snapshot time, filters and seven readable records across seven pages. Original check: **Consumable lots → Stock balance report → Generate stock balance report → Print report / save PDF**. Select **Save as PDF** in the browser dialog. Confirm the PDF shows the stock balance report title, snapshot time and applied filters. This is the only owner check; other reports, long histories and print cleanup are developer-verified.

## Verification and deferred work

Developer November 11, 2026: 61 web tests and the web build passed. The 228 domain and 155 HTTP/SQLite tests passed on the preceding build; backend/source code is unchanged and those suites were not rerun for this UI-only change. Two new print-model tests cover all four complete snapshots, filters/window/scope, signed and missing quantities, source text, empty records and localization.

Chromium generated PDFs for all four reports with 53 records each while the UI was on page two and inputs contained unapplied edits. Text extraction confirmed all 53 record codes in each PDF and no app navigation; layout checks found no horizontal cell overflow. PDF inspection confirmed A4 landscape. Supplied HTML-like text stayed literal with no injected nodes or execution. Source request counts did not increase during printing. After-print cleanup restored the screen/title. A first PDF page was rendered and visually inspected for wrapping/readability.

U-EXPFILTER-01 passed from the owner's uploaded CSV. U-STOCKPRINT-01 passed from the owner’s uploaded seven-page PDF (snapshot 2026-11-11T18:56:52.550Z, seven records, All lots / All statuses). Physical printers, non-Chromium print engines, browser header/footer preferences, very large production documents, archival PDF standards and broader manual acceptance remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
