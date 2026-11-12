# Export and import report presets

Reports hub → Transfer report presets provides Export presets JSON and Choose presets JSON file. The version 1 file contains only names and validated filters for balances, fixed/relative movements, expiry and replenishment. IDs, tenant/facility/actor scope and report snapshots are omitted. Import creates fresh IDs under the destination browser's current user and facility. Exact lot codes and fixed dates stay as entered, so the review note asks the user to check them for that facility. Run preset still fetches fresh scoped report data.

Choosing a file parses and validates it without writing preferences or querying reports. Review import lists every name, report type, readable filter summary and Ready to import / Duplicate name — skipped status. Duplicate names are compared ignoring case against saved presets and earlier rows in the file. Import new presets appends only the reviewed new entries after explicit confirmation. Cancel import discards the preview. Existing definitions are never overwritten. All-duplicate/empty selections disable confirmation; exceeding a total of 100 presets is flagged before saving.

The file must be UTF-8 JSON with exactly format “ruby-stock-report-presets”, version 1 and presets [{name,settings}]. The entire file is rejected if any entry, filter, envelope/version or unexpected field is invalid. Limits: 128 KiB, 100 entries, existing name/filter/date bounds. Imported text is rendered as React text, never HTML. Source IDs and scope fields are rejected rather than reused. Validation precedes the single browser-storage write, so malformed input, quota errors, an intervening conflicting name or capacity change cannot partially import a selection. On observed storage changes the review refreshes for another confirmation. Fully simultaneous cross-tab writes remain non-transactional. Browser storage errors retain existing data.

## Verification — November 12, 2026

73 web tests and the web build passed. New tests cover every filter variant, portable round trips, omitted scope/IDs/snapshots, malformed/oversize/versioned files, unknown fields, duplicate review, capacity/stale conflicts, invalid IDs, atomic transformations and literal display text. Chromium exported from one actor and imported to another, checked no writes before confirmation, cancellation, new identities, duplicate/mixed files, readable summaries, literal HTML-like names, fresh destination-scoped runs, malformed/oversize input, blocked storage, an intervening duplicate, capacity, reload persistence, ES/FR and mobile layout. Existing create/edit/rename/run preset regressions passed. No domain writes or browser errors. Review layout was visually inspected. Backend unchanged; prior 228 domain and 155 HTTP/SQLite tests were not rerun for this UI feature.

## One owner check — U-PRESETTRANSFER-01 pending

Reports hub → Export presets JSON → Choose presets JSON file and select that downloaded file in the same browser/user → confirm the review flags the names as Duplicate name — skipped and Import new presets is disabled → Cancel import. Expect no additional presets. This is the only owner check; developer tests cover importing into a different user/browser scope. No stock movement is requested.

U-EDITPRESET-01 passed November 12 from the owner's confirmation and thirty-day report screenshot. Shared/server synchronization, automatic conflict renaming/overwrite, future file versions, scheduling, simultaneous transactional preferences and production scale remain deferred. Ruby Asset Management reuse remains intended; U-TRACE-01 and original U-LOANER-01 remain unconfirmed, and RSP-ISS-001 stays parked.


## Export feedback follow-up — November 12, 2026

Owner reported that Export presets JSON appeared to do nothing, then found and uploaded the downloaded file. Parsing that file confirmed valid version 1 JSON with three presets: Expiry 30 days, last7 and Last 30 days. This establishes successful export, not owner acceptance of the duplicate import review. U-PRESETTRANSFER-01 remains unconfirmed beyond export.

The UI now says Download requested, displays the filename with a direct Download JSON file link, and points to browser Downloads. This message describes a requested download, not proof that the browser saved it. A hidden anchor is attached during the automatic click; the prepared object URL remains valid for a manual retry until the next export or navigation, then is revoked. If export is disabled because no presets exist, a visible note explains that a preset must first be saved. Failed preparation clears the previous file link and reports an error. EN/ES/FR labels are included.

73 web tests and the preview build passed. Chromium suppressed the scripted anchor click and verified that feedback and filename still appeared, the direct link downloaded the correct JSON, normal exports still worked, previous URLs were revoked only on replacement/navigation, storage errors did not claim success, and ES/FR/mobile layouts worked. Existing transfer/import regression checks passed. No stock writes or browser errors. Screenshot inspected. Backend unchanged; previous domain/HTTP suites not rerun for this UI feedback fix.

Single owner check U-PRESETEXPORTFEEDBACK-01 passed November 12, 2026: Reports hub → Export presets JSON. Confirm the visible Download requested message and filename/link. No repeat import test is requested for this build. Browser-specific save locations/prompts remain controlled by browser settings; U-TRACE-01/original U-LOANER-01 remain unconfirmed and RSP-ISS-001 stays parked.


## Single export action follow-up — November 12, 2026

Owner confirmed the automatic download and supplied a screenshot showing the requested feedback, satisfying U-PRESETEXPORTFEEDBACK-01. They also noted that clicking the additional download link created a duplicate file. The link is now removed: Export presets JSON is the only download action. The filename is plain text; Download requested points to browser Downloads without suggesting a second action. The preceding direct-link description is superseded. File preparation, URL cleanup, empty/error states, import validation and saved presets remain unchanged.

73 web tests and the preview build passed. Chromium observed exactly one download per Export click, validated the downloaded JSON, clicked the plain filename without creating another download, confirmed no download anchors remain, and checked repeated explicit exports, failure/empty states, EN/ES/FR and mobile layout. No stock writes or browser errors. Backend unchanged; no repeat domain/HTTP suites needed for this presentation-only correction.

Single owner check U-SINGLEPRESETEXPORT-01 pending: Reports hub → Export presets JSON once. Confirm one download plus a plain filename and confirmation text, without another download link. U-PRESETTRANSFER-01 remains unconfirmed beyond export. Other deferred items remain unchanged.
