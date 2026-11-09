# Operational performance reports

Read-only recorded-work reporting is available from **Operational performance** for every preview role. No setup fixture is required.

## One owner check: U-PERF-01 (passed November 9, 2026)

Owner screenshots confirm the displayed November 3–9 period, seven daily rows, summary cards and timing tables. Original check: after updating and restarting the preview, open **Operational performance** and click **Generate report** with the default dates. Expect a displayed period/snapshot, seven daily UTC rows, summary cards and recorded stage timing tables. Counts depend on existing records; zero counts and missing timing samples are valid. CSV export is developer-verified. This check is demonstration acceptance only.

## Definitions

- The UI uses inclusive From/Through UTC days, defaulting to seven days including today. The API uses `GET /api/v1/sterile/facilities/:facilityId/performance?from=YYYY-MM-DD&to=YYYY-MM-DD`, with an exclusive `to`. Maximum 90 days; no future day beyond tomorrow's UTC boundary.
- Daily throughput counts recorded events: receipt episodes, completed cleaning attempts, inspection records, completed assemblies, packed packages, completed cycles, review decisions, package issues and returns. Historical revisions do not multiply an event. These are not unique instruments or clinical availability.
- Instrument activity counts occurrences by stage/type. Retries and reprocessing can count an instrument again. Cycle contents use the package version frozen in the load.
- Cleaning/inspection failure rates use completed passed plus failed outcomes. Repeat cleaning starts count attempt numbers greater than one. Cycle outcomes and hold/reject review decisions are separate.
- Timings use complete non-negative recorded timestamp pairs with their completion endpoint in the period: cleaning start/result, receipt/first passed inspection, cycle start/result and cycle result/first release. Sample counts, mean, median and nearest-rank 95th percentile are shown. No samples means missing, not zero. These are recorded elapsed times, not measured physical processing durations.
- Equipment run minutes merge overlapping intervals per machine, clipped to the period and snapshot. Out-of-service minutes use explicit saved status revisions, including the preceding status at the start of the range. Legacy code-only references have unknown downtime. No utilization percentage, idle time, automatic telemetry or unrecorded outage is inferred; running work can overlap an out-of-service decision.
- Current queue totals and up to 20 oldest records are a separate snapshot, independent of the activity date filter. Age is since the last recorded update, not verified queue dwell. Existing workflow gates still apply when a record is opened.
- Unfinished overlapping attempts/cycles, invalid timestamp pairs, missing cycle package snapshots and invalid backlog dates are disclosed separately.

## Scope, limits and export

All reads are tenant/facility scoped. `reports:read` and every contributing source's read permission are required before querying. The report reads current saved records, immutable event arrays and required version snapshots in one transaction; it makes no workflow changes.

Each source is bounded at 5,000 rows, combined inputs at 20,000, reference/work budget at 100,000, package-version fetches at 5,000 and equipment/type groups at 1,000. Exceeding a limit returns `REPORT_LIMIT` instead of a partial report. Production aggregate/index/scale work remains deferred.

Changing filters retains the prior displayed snapshot until Generate report succeeds. CSV exports that same object with scope, UTC period, snapshot, definitions, all metric sections and missing values left blank. Cells are quoted and spreadsheet formulas neutralized.

Developer verification November 9, 2026: 373 scoped tests passed (202 domain, 131 HTTP/SQLite, 40 web); builds; Chromium seven-day report, panels, refresh and CSV snapshot retention after date edits. Physical equipment integration, site calendars, broader language/mobile/large-history acceptance, clinical/operational acceptance and advanced analytics remain deferred. RSP-ISS-001 remains parked.
