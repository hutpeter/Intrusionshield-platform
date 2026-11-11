# Relative movement report presets

Stock movement report now offers Date range (UTC): Fixed dates, Last 7 days and Last 30 days. Relative periods include the current UTC day. The request starts at midnight UTC on the first included day and ends at midnight after the last included day. Both Generate and Run preset resolve the range at request time. The displayed From/Through dates are disabled in relative mode and update on generation. Switching to Fixed dates enables manual date entry.

Relative presets store only last7/last30 plus the existing lot and movement-type filters. They do not freeze resolved dates or report rows. Existing browser keys and old fixed-date records remain valid without migration; fixed date limits still come from the current UTC day rather than an old preset's end date. Hub entries show the relative label or explicit fixed dates. Storage remains browser/user/facility scoped, without cross-device synchronization. English, Spanish and French labels are included.

CSV and printing still export the generated snapshot's actual UTC period. Changing the range or crossing midnight does not rewrite an existing snapshot. Generate again to replace it. Existing server validation, ninety-day maximum, source permissions, and stock quantities are unchanged.

## Developer verification

66 web tests and the web build passed. New tests exercise UTC midnight rollover, year/month boundaries, leap day, an offset timestamp, legacy fixed records, mixed storage and invalid/ambiguous ranges. Chromium checks cover seven/thirty-day query boundaries, automatic preset reruns across a simulated UTC midnight, exact movement-type restoration, fresh snapshots, CSV filenames and print metadata retaining the old generated period, legacy fixed preset persistence, current fixed-date maximum, EN/ES/FR and mobile layout. No domain writes or browser errors. Backend unchanged; earlier 228 domain/155 HTTP/SQLite suites were not rerun for this UI feature.

## One owner check — U-RELATIVEMOVE-01 pending

Reports hub → Stock movement report → Date range (UTC): Last 7 days → name it “Last 7 days” → Save preset → Back to Reports hub → Run preset for that name. Confirm automatic generation and a From/Through period covering seven UTC days including today. This is the only owner check; no stock mutation is requested.

Other relative periods, scheduling, email delivery, shared/server preferences, production scale and broader owner acceptance remain deferred. Future Ruby Asset Management reuse remains intended. U-TRACE-01 and original U-LOANER-01 remain unconfirmed; RSP-ISS-001 stays parked.
