# Traceability search and reports — local preview

Read-only search connects recorded instrument, tray definition, assembly, package
and load history. It includes receiving/cleaning/inspection evidence, review,
storage/issue, return, recall and linked reprocessing records. No new demo records
are created by searching or exporting.

## Update and run

Stop the running preview with Ctrl+C in PowerShell, then run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for Ready, keep PowerShell running and refresh http://127.0.0.1:9553.
Existing fictional records remain available.

## One owner check — U-TRACE-01

1. Enter the demonstration as **Demo operator** (reviewer and auditor can also read).
2. Open **Traceability and reports / Trazabilidad e informes**.
3. Click **Trace latest returned package / Trazar último paquete devuelto**.

Expected: the returned package code, linked workflow records from receiving through
its original issue and return, **Current holds and blocks**, **Source links** and
**Recorded events**. The previous owner return check supplies the package. This
is the only requested owner check. Exporting and historical-version walkthroughs
can wait for the broader manual test session.

Alternatively, enter an existing exact instrument, tray definition, assembly,
package or load code and click Search history. Codes normalize to uppercase;
partial/wildcard matching is not offered. When the same code exists in different
record types, explicitly choose the matching type.

## Report behavior

- Current records and saved historical versions are separate. Choose a record,
  then a saved version to inspect its fields and recorded checks/actions.
- Links retain the source and target versions actually recorded. If a referenced
  version lacks a saved snapshot, it is marked unavailable rather than being
  silently replaced by the current version. Older instrument versions may have
  audit attribution without a separately saved instrument snapshot.
- Timeline events retain original actor attribution, reasons and timestamps.
  Assembly/receipt events created by return disposition retain parent-command
  correlation. Displayed times use the facility time zone; CSV timestamps use ISO UTC.
- Current processing holds, active assemblies, package recall blocks and return
  blocks are read in the same database transaction as the report. Original release
  and issue facts remain historical even when a current block exists.
- Package and assembly roots focus on their recorded instrument membership.
  Instrument history spans its saved processing episodes and packages, so linked
  reprocessing can be followed in both directions. Load roots include members of
  current and historical load versions. Tray-definition roots include assemblies
  using that definition and their recorded instrument membership.
- Other packages sharing a load appear only in load context counts. Their unrelated
  instrument histories are not recursively expanded for an instrument/package
  search. Counts distinguish all source-load packages from matched packages.
- This report shows recorded links, not proof that missing physical steps happened,
  an equipment validation, a clinical release certificate or physical tracking.
  New or explicitly extended recalls now include recorded reprocessing lineage and
  current custody. Legacy cases require explicit extension; see RECALL-LINEAGE.md.

The report is a point-in-time snapshot with a generation timestamp. Searching again
refreshes current status; exporting preserves the displayed snapshot. Repeated
versions can contain the same previously recorded checks; each remains identified
by its source record and version.

## CSV export

**Export CSV report** downloads a UTF-8 CSV of report scope/root/time, all selected
saved versions and fields, recorded checks/actions, source links, events and current
holds/blocks. It includes the whole generated report, regardless of UI pagination.
Column headings and display labels follow the selected ES/EN/FR language. Codes,
evidence references, user-entered observations and identifiers remain unchanged.
ISO timestamps retain an unambiguous UTC reference. Spreadsheet formula prefixes
are neutralized and quotes/newlines are escaped; this is a text report, not an
executable spreadsheet. Actual Excel/LibreOffice regional import remains a deferred
manual check. A downloaded report does not update after later workflow changes.

## Scope, limits and validation

The API requires the dedicated `traceability:read` permission under `sterile.core`,
verified tenant/facility membership and normal authenticated session controls. It
aggregates that facility's authorized history; a production policy must grant this
permission deliberately. Preview operator/reviewer/auditor fixtures have read access.

The SQLite adapter selects relevant current and historical rows within scope;
there is no new schema or production database operation. Reports reject more than
1,000 source snapshots, 2,000 audit events or 8 MiB serialized output with TRACE_LIMIT.
They never silently present a truncated result as complete. Narrow the code search
or plan a later paginated/report-job implementation for larger histories. UI lists
paginate within the already generated report.

See TESTING-REGISTER.md for automated/developer evidence and deferred owner tests.
RSP-ISS-001 independent inspection remains parked. RSP-ISS-004 is partially implemented
by RECALL-LINEAGE.md; production policies and validation remain pending. A traceability
report is read-only and does not itself extend a recall or change authorization.
