# Edit and rename saved report presets

Each saved preset in Reports hub has Edit preset. It opens the existing report form with the saved name and filters, without querying report data. Change the name, exact lot/status/action, expiry horizon or fixed/relative movement period as applicable, then Update preset. The same ID, report type, list position and number of presets are retained. Replenishment supports renaming because it has no input filters.

Cancel editing or closing the report returns to the hub. Only Update preset writes preference changes; leaving with unsaved edits discards them, as the edit note explains. A successful update remains saved if the editor is then closed. Generate can preview data while editing; changing or saving preferences does not rewrite a generated CSV/print snapshot. Run preset opens a fresh report and fetches current data. New preset creation and existing Consumable lots entry points retain their behavior.

Names remain case-insensitively unique, trimmed, one–80 characters. Invalid filters, failed browser storage and changed/deleted records are rejected without overwriting the saved preference. Updates reread storage and compare the edited entry with the definition originally opened; conflicts refresh the hub's observed list so the user can reopen the current entry. This is protection against an observed intervening edit, not a transaction across simultaneous browser tabs. Storage remains browser/user/facility scoped, without server or cross-device synchronization. EN/ES/FR labels are included.

## Verification — November 11, 2026

68 web tests and the web build passed. New tests cover stable identity/order, rename, fixed-to-relative filter updates, immutability, updates at the hundred-preset limit, duplicate names, invalid settings, report-type changes and changed/deleted edit targets. Chromium exercised edit/rename/save/run for all four reports, no source query on Edit or Update, restored query filters, cancellation, duplicate names, blocked storage, stale/deleted targets, refresh persistence, scope separation and ES/FR/mobile layout. Existing preset and relative-date regression checks passed, including frozen CSV/print metadata. No stock writes or browser errors occurred. The edit form screenshot was visually inspected. Backend unchanged; prior 228 domain and 155 HTTP/SQLite tests were not rerun for this UI feature.

## One owner check — U-EDITPRESET-01 pending

Reports hub → Edit preset for your saved Last 7 days movement preset → change Date range (UTC) to Last 30 days and Preset name to “Last 30 days” → Update preset → Close movement report → Run preset for the renamed entry. Confirm one renamed entry and automatic generation over thirty UTC days including today. This is the only owner check; no stock mutation is needed.

Additional relative windows, scheduling, shared/server preferences, transactional simultaneous edits and production scale remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked. The earlier owner screenshot confirms November 5–11 movement output with eight movements; it does not independently show the full relative preset save/run route, which remains unconfirmed in U-RELATIVEMOVE-01.
