# Package integrity and shelf-life controls

## One owner check

U-PACKSAFE-01 pending: enter the updated preview as **Demo operator** → **Packaging and labels** → **Prepare fictional packaging example**. The existing example now prefills **Shelf-life policy: Event-related**, **Facility policy reference: SIMULATED-FACILITY-SHELF-LIFE**, **Policy revision: DEMO-1**. Review and tick the closure, contents and packaging confirmation boxes, then **Save packaging**. Expect the saved **Package integrity and shelf life** panel with the event-related policy and reference. This is the only owner check requested. It does not accept real policy or validate clinical suitability.

## Recorded policy

New UI packaging requires an explicit selection: event-related (no computed expiry) or time-based (a manually specified UTC expiry instant). Both record the facility policy reference and revision. These are operator-entered references to approved local policy, not a centrally published policy library, manufacturer validation, a default shelf duration or automatic date calculation. Time-based policies also capture an integer warning window of 1–365 days. The entered UTC instant is the exact cutoff: at or after it, the package is expired. No implied end-of-day or browser timezone is used. Packaging requires a future canonical ISO UTC expiry; invalid/normalized impossible dates and event-related dates are rejected.

The complete policy snapshot is frozen in the package's original version and preparation label. Load and review membership also capture it for the release-decision label. It cannot be extended, changed or converted in place. A new policy reference does not alter older packages. Legacy records and older API clients may omit policy; these remain **Shelf-life policy not recorded — legacy package**, with their existing workflow behavior. No calendar expiry is inferred and omission never becomes an event-related policy. Site-wide mandatory enforcement, approved policy publication/competency, exception and legacy remediation rules require a later increment.

## Persistent integrity incidents

Packaging writers can explicitly **Report compromised integrity** on a current packaged record, including a package already in a load or issued. A reason, evidence reference, documented location and confirmation are required. A single immutable, scoped integrity hold is stored independently of the package. It is audited atomically, retry-safe and never changes the package version, original scan identifier, label or source review. There is no clear-hold action or automatic assertion that stock has been physically quarantined. The documented location is incident evidence; it does not rewrite custody or notify recipients.

A current package read shows the hold; the historical package snapshot stays unchanged. Package history contains the integrity incident, and trace reports show its current alert and full evidence fact. Multiple further incident reports/corrections/attachments and physical chain-of-custody reconciliation are deferred.

## Workflow rules

Current expiry and integrity are checked transactionally when adding packages to a load, starting a draft cycle, releasing a load, storing, transferring, issuing and scanning for distribution. Time passing or a hold recorded after a form was opened still blocks the write. Approaching expiry is a warning, not a block. Event-related records continue to require the existing positive integrity confirmation at distribution; a recorded incident blocks them regardless of checkbox input. Every rejected operation leaves custody and historical evidence unchanged.

A running cycle can still record its outcome; hold/reject review evidence can still be recorded. An issued package can still be found and received through the return workflow using the original scan identifier. Existing recall, return and reprocessing restrictions remain. Recording an incident does not automatically revoke a prior release decision, start a recall, contact recipients, recover stock, or confer clinical availability. Current review reads flag expiry/integrity blocks and the app's release-label print action rechecks them. Existing printed labels remain historical evidence; staff must check current status.

Before loading, the existing explicit void/repack route can preserve the old package record while creating a new package with closure/content/inspection eligibility checks. Loaded or issued packages must follow their existing recall/return/disposition route; an integrity incident does not bypass those restrictions. Clearing a case never silently restores the old package. Policies for post-cycle failures, physical label destruction, disposition authority and real processing require operational validation.

## Dashboard and persistence

**Package integrity and expiry alerts** uses packaging read permission, 12-row paging and tenant/facility scoping. It lists non-voided, non-returned packages with an integrity hold (including issued stock), or with expiry within their recorded warning window (excluding already-issued stock for calendar warnings). Expired entries remain in this queue. No-policy and event-related records have no calendar warning. The queue overlaps workflow/recall queues and is refreshed explicitly. Loading queues exclude expired and integrity-held packages. Counts are not authorization.

The local SQLite adapter adds `sp_package_integrity` with a scoped package foreign key and unique scoped package ID; no package/history payload is rewritten. Policy snapshots use existing JSON package storage. Production migrations, timezone/clock assurance, large-site indexes, policy governance, expiry notifications, attachments and hardware/clinical acceptance remain deferred.

## API

- Optional `shelfLife` on POST `/packages`: exactly `{mode, reference, revision, expiresAt, warningDays}`. `expiresAt` is `null` for `event_related`, canonical future UTC ISO for `time_based`.
- POST `/packages/:id/integrity-hold`: `{requestId, packageVersion, reason, evidence, location, confirmed}` under packaging write authorization and normal preview origin/CSRF protections.
- GET `/packages/:id` and current distribution reads expose recorded policy/current hold. Historical reads keep their original payload.
- GET `/dashboard/queues/packageAlerts?page=N` uses packaging read authorization.
- Denials: `PACKAGE_EXPIRED` or `PACKAGE_INTEGRITY_BLOCKED` (409), plus existing strict-input/scope/version errors.

M-PACKSAFE-01 deferred: broader owner time-based expiry/incident/recall/return/repack/language/mobile walkthrough. M-PACKSAFE-02 deferred: clinical/IFU/site policy, production migration/clock/scale, physical labels and operational acceptance. RSP-ISS-001 independent inspector work remains parked.

Developer verification November 8, 2026: 343 unique scoped tests (186 domain, 121 HTTP/SQLite, 36 web), scoped builds and targeted Chromium policy form/UTC expiry/warning/frozen release label/explicit damage confirmation/blocked label/dashboard/reload checks passed. Tests cover exact expiry boundary, start/release/distribution gates, retaining running outcome and return scan, immutable snapshots, scope/CSRF/roles, audit rollback/retry, SQLite reopen and foreign-response refusal.
