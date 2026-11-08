# Repeat-visit loaner readmission

## One new owner check

**U-LOANREADMIT-01 pending:** as Demo operator:

1. Open **Loaner and vendor sets** → **Prepare fictional loaner readmission example**.
2. Review the original instrument code and prefilled new receiving details.
3. Tick the complete-original-set and fresh-processing confirmations, then **Save loaner readmission**.

Expect **Visit: 2**, **Received — with facility**, the same instrument code, a new
**Linked receiving episode**, and a readmission entry in history. Only this new aspect
is requested. The first loaner receipt owner check U-LOANER-01 remains unconfirmed;
this check does not retroactively pass it. No manual cleaning or supplier hand-back
walkthrough is requested in this build.

The fixture explicitly simulates a new first receipt, cleaning, inspection and supplier
hand-back, all with fictional evidence. It stops at the new readmission form for the human
confirmations. No existing records are replaced and no physical processing occurs. Setup
is development/operator-only, CSRF protected, transactional and retry-safe.

## Workflow and safeguards

A **Readmit returned loaner set** button appears on the current supplier-returned record.
It accepts the complete original member IDs, a new receiving episode code, arrival
location/custodian/reference/condition/observation and optional expected supplier-return
date. The original supplier and set reference are immutable. Unexpected, changed or partial
sets require a separate exception policy and are not silently admitted through this route.

Readmission is permitted only from a recorded supplier hand-back at the current version.
Members must retain their original ownership, be registered and have no active assembly,
processing hold or unresolved recall restriction. Retired or repair-held instruments cannot
be admitted through this complete-set path. All reads/writes remain in the authenticated
facility and tenant. Supplier changes, client-supplied counters and actor/scope overrides
are rejected by the exact API contract.

One transaction creates a new `received` episode with current instrument identity snapshots,
empty cleaning attempts/inspections and fresh processing reservations. The existing loaner
record returns to `received`, increments its visit and record version, and records arrival
actor/time. Instrument IDs, codes, serials, supplier ownership and identity versions remain
unchanged. No new inventory identities are created. The initial receipt actor/time stay
attributable; new arrival metadata is separate. Earlier receiving and hand-back versions
remain immutable and accessible through history.

Previous inspection, package/release evidence and supplier hand-back do not satisfy the
new visit. Immediate supplier hand-back is refused while the new processing holds exist.
Follow the normal processing and custody workflow before any later hand-back. Recorded-cycle
service totals, baseline, policy and due state are preserved; supplier work or a repeat visit
is not evidence of authorized service or an automatic reset. Due instruments remain blocked
from new assembly/packaging even after this fresh receiving episode.

Stale/competing requests accept at most one transition; the same request ID replays its
saved result. A failure at the final audit write rolls back the new episode, processing
holds, loaner update/version and retry receipt. No arbitrary unblock or restoration of stock
is provided. Old printed identity codes still identify the same instruments and resolve
their current status; identity printing is not clinical release.

## API and records

`POST /loaners/:id/readmit` requires `loaners:write` and `processing:write`, exact fields,
current loaner version, exact complete original membership and two confirmations. Preview
writes use exact origin and CSRF; reviewer/auditor cannot perform operator receipt actions.
A new receiving episode has `loanerSource` with receipt ID/code and visit number. Trace
facts retain the visit number. This uses existing loaner/current/version tables and receipt
transactions; old records without a visit number are treated as Visit 1. No data rewrite
or historical instrument recreation is performed.

## Verification and deferred work

Developer November 8, 2026: 325 scoped tests (175 domain, 116 service/SQLite/HTTP, 34 web),
scoped builds and browser verification. Coverage includes stable identities/ownership,
fresh unprocessed episodes and holds, preserved service limits, original hand-back versions,
wrong/partial/foreign/duplicate/stale/unconfirmed refusal, source roles/CSRF/strict bodies,
recall restrictions, request replay/races, final-audit rollback, SQLite reopen persistence
and retry-safe fixture setup. Browser checks cover both confirmations, Visit 2, original
codes/IDs, new receiving link with no inherited inspection, historic hand-back, ownership
and fresh holds after refresh with no browser errors.

U-LOANREADMIT-01 remains pending. M-LOANREADMIT-01: owner multi-visit hand-back, service-due/
repair/recall intersections, race/error/retry/history and source permissions. M-LOANREADMIT-02:
physical matching, serial/UDI authenticity, mixed/partial shipments, vendor service evidence,
Windows/ES/FR/mobile/accessibility, scale and production identity/competency/vendor-policy
acceptance. These remain deferred. RSP-ISS-001 independent inspection stays parked.
