# Saved stock report presets

Reports hub now saves named filter setups for balances, movements, expiry and replenishment. Open a report, choose filters, enter Preset name and Save preset. Back to Reports hub lists saved entries with Run preset and Delete preset. Save uses the current input filters, including edits not yet generated. Run opens the report and automatically fetches a fresh scoped snapshot. It never restores report data. CSV and printing continue to use the generated snapshot.

Presets live in browser local storage, separated by tenant, facility and actor. They do not synchronize to other browsers/devices and are removed by clearing browser data. The screen states this limitation. Names are unique ignoring case, trimmed, one–80 characters, with at most 100 presets per scope. Unsupported/corrupt data and blocked storage are reported without silently replacing stored entries. Mutations reread storage to preserve intervening saves from another tab; fully simultaneous cross-tab edits are not transactional.

Balance presets retain exact lot/status; movement presets retain exact lot/action and fixed inclusive UTC dates (at most ninety days). Expiry presets retain lot/status and a one–365 day horizon, recalculated on the run date. Replenishment has no input filters and reruns the current planning report. Existing server permissions, response validation and snapshot export/print semantics remain in force. Presets are browser preferences, not server audit records. EN/ES/FR labels and narrow layouts are supported. Existing Consumable lots report entry points do not show preset controls.

## Verification — November 11, 2026

64 web tests and the web build passed. New tests cover scope isolation, malformed storage, unique names/limits, unsupported settings and UTC window validation. Chromium checked saving and running all four report types, restored query parameters, fresh timestamps on repeated runs, CSV snapshot metadata, refresh persistence, duplicate names, actor separation, deletion, ES/FR/mobile, storage quota denial and corrupt data. No domain writes or browser errors occurred. Existing hub generation/CSV/printing/back, source lot links, unsaved-form guard and auditor access checks passed again. The presets hub screenshot was visually inspected. Backend unchanged; prior 228 domain and 155 HTTP/SQLite checks were not rerun for this UI-only feature.

## Single owner check — U-REPORTPRESET-01 passed November 11, 2026

Reports hub → Consumable expiry report → enter Preset name “Expiry 30 days” → Save preset → Back to Reports hub → Run preset for that name. Keep default filters. Confirm the report generates automatically with the thirty-day horizon. This is the only owner check for this build; no stock movement is requested.

U-REPORTSHUB-01 passed from the owner's seven-lot balance screenshot. Broader owner testing, cross-device/shared/server presets, editing/renaming, relative movement windows, concurrent transactional preferences and production scale remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.

Owner acceptance November 11, 2026: “everything worked” confirms the requested U-REPORTPRESET-01 expiry preset save → return to hub → run route. Other automated checks remain developer evidence; deferred acceptance items remain unchanged.
