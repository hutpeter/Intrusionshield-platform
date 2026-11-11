# Reports hub

The sidebar Reports hub provides cards for stock balances, stock movements, replenishment and consumable expiry. Each opens the existing report component. Existing Consumable lots report buttons remain available.

Opening the hub or a card does not query report sources. Generate retrieves a scoped snapshot; CSV and Print report / save PDF use that saved snapshot, including filters and all rows. Existing consumables:read permissions and server validation remain unchanged. Stock-record links open the exact lot in Consumable lots. Navigation retains the existing busy and unsaved-form guard. Labels support English, Spanish and French; cards wrap on narrow screens.

## Verification

November 11, 2026: 61 web tests and the web build passed. Chromium checked all four generate/CSV/print/back routes, no source requests on opening or printing, exact lot navigation, original entry points, Spanish/French labels, mobile card bounds, unsaved form keep/discard and auditor read access. No stock writes or browser errors occurred. The hub screenshot was visually inspected. Backend code is unchanged; previous 228 domain and 155 HTTP/SQLite passing checks were not rerun for this UI change.

## One owner check

U-REPORTSHUB-01 pending: update/restart, then Reports hub (left sidebar) → Stock balance report → Generate stock balance report. Confirm the hub contains four report cards and the balance snapshot opens. No stock mutation is needed.

U-STOCKPRINT-01 passed November 11 from the owner’s seven-page stock balance PDF. Broader owner acceptance, physical printers, other print engines, production scale and Asset Management integration remain deferred. The shared report foundations remain candidates for future Ruby Asset Management reuse. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
