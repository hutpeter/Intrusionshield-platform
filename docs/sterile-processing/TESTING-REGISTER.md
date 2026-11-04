# Testing register — Ruby Sterile Processing

Updated November 4, 2026. This is the continuing register for every increment of
this application. Update it with each build and after each user-reported result.
It distinguishes automated verification from the owner's manual verification.
A successful developer check never implies that the owner performed it.

## Agreed testing approach

- Continue scoped automated checks during development, especially authorization,
  tenant/facility isolation, persistence, audit, concurrency and workflow gates.
- Give the owner one short check of the main new aspect per build. Waiting for a
  broader manual walkthrough does not block the next development increment.
- Defer the larger manual regression and connected clinical-workflow review until
  the main modules are connected. Deferred does not mean passed.
- Record failures explicitly, fix reproducible defects, and rerun the affected
  check. Do not repeatedly run unrelated legacy suites or connect live databases.
- Automated and developer browser checks use isolated fictional data. Windows,
  real equipment, production identity and operational validation require their
  own evidence. This preview is not a production acceptance test.

## Build ledger

| Build                       | Delivered change                                                                                         | Automated / developer verification                                                                                                          | Owner verification                                                                                                         | Outstanding                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 427feeb / a85508a / 9287358 | Instrument catalogue, registration, history, preview startup fixes                                       | Scoped checks and browser flow recorded in LOCAL-PREVIEW.md; Windows pnpm launcher and cross-site entry fixes included                      | Confirmed registration of INS-DEMO-001, retained records after refresh/restart, and working preview                        | Formal retirement, auditor and language regression on Windows deferred                              |
| 0ac4dab                     | Tray definitions, assembly, reservations and immutable versions                                          | 53 automated checks; browser composition/history/disassembly; restart persistence                                                           | Confirmed ARMADO-DEMO-001 completion with INS-DEMO-001, versions 1–3, and saved assembly after reopening following refresh | Manual duplicate-assignment, definition revision, disassembly/reuse and auditor regression deferred |
| 58aaf13                     | Receipt, cleaning attempts, failure/retry and processing holds                                           | 69 automated checks; Spanish cleaning/retry browser workflow; EN/FR/mobile/auditor/session checks; full restart retained evidence and holds | Not yet reported. Minimal receipt smoke check offered; no result received                                                  | Receipt smoke check pending; longer manual failure/retry walkthrough deferred                       |
| ad63b0b                     | Individual inspection checks, held failures/rework, passed inspection enables assembly; fictional setup  | Results recorded below after verification                                                                                                   | Passed November 4, 2026 — owner confirmed with screenshot                                                                  | Failure/rework, group handling and full workflow manual review deferred                             |
| bee5f4d                     | Packaging with frozen tray/inspection proof, material lot, printable preparation label and explicit void | Current results recorded below                                                                                                              | Passed November 4, 2026 — owner screenshot confirms saved label                                                            | Manual void/repack, device labels and connected cycle/release review deferred                       |
| e64c063                     | Draft load membership, manual start/outcome/evidence, package interlocks and held review state           | Current results recorded below                                                                                                              | Passed November 4, 2026 — owner screenshot confirms saved awaiting-review result                                           | Manual failure/abort/rework, equipment integration and release review deferred                      |

## Owner's current single check — cycles

**U-CYCLE-01 — Passed November 4, 2026.** The owner supplied a screenshot of
the saved version 3 load in English, showing **Awaiting review — not released**,
cycle/indicator evidence references and the retained-package notice. This confirms
the single cycle-result smoke check; it does not establish clinical release or
the deferred broader English-language review.

Original single check: follow [LOADS-CYCLES.md](LOADS-CYCLES.md): prepare a
separate fictional running-cycle example, choose **Satisfactorio — requiere
revisión**, confirm the entered evidence and save. Expected: **Pendiente de
revisión — no liberado**. No real equipment operation or additional manual
walkthrough is requested for this build.

## Owner's completed packaging check

**U-PACK-01 — Passed November 4, 2026.** The owner supplied a screenshot of the
saved package and preparation label, showing the package code, tray, material lot,
packing attribution and **NO ESTÉRIL · NO LIBERADO**. Physical printing is not
confirmed and remains deferred.

Original single check: follow [PACKAGING.md](PACKAGING.md): prepare a separate
fictional packaging example, save the prefilled package after the three
confirmations, and open its label. Expected: **NO ESTÉRIL · NO LIBERADO**, the
saved package code, tray and material lot. No physical printing or void/rework
walkthrough is requested now. Existing records remain intact.

## Owner's completed inspection check

**U-INSP-01 — Passed November 4, 2026.** The owner reported “It worked” and
supplied a screenshot showing the saved all-pass inspection and its individual
results. This confirms the single smoke check below; it does not validate the
deferred cleaner/inspector separation requirement in [RSP-ISS-001](ISSUES.md#rsp-iss-001--independent-inspector-role-and-no-self-inspection).

Original smoke check: In **Recepción y limpieza**, choose **Preparar ejemplo
ficticio de inspección**, then **Registrar inspección**. Enter dummy procedure
`INSPECT-DEMO`, version `1`, evidence `EVID-INSP-DEMO`. Choose **Conforme** for the
four checks, confirm and save. Expected: **Inspección satisfactoria — disponible
para armado**. Report only whether this result appeared; no further manual tests
are requested for this build. The setup creates separate fictional records and
simulated cleaning; it does not perform cleaning or alter existing demo records.

## Deferred manual scenarios and their release gates

| ID           | Scenario                                                                                                      | Status / prerequisite                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| M-REG-01     | Retire instrument, reason/history retained; auditor cannot write                                              | Deferred; registration stage exists                                                       |
| M-TRAY-01    | Duplicate reservation denied; retirement denied while assigned                                                | Deferred; automated coverage exists                                                       |
| M-TRAY-02    | Definition revision preserves old composition; disassemble/reuse preserves history                            | Deferred; automated coverage exists                                                       |
| M-CLEAN-01   | Failed cleaning, evidence, mechanical retry and retained earlier versions                                     | Deferred; developer browser and automated coverage exist                                  |
| M-INSP-01    | Missing result/evidence/confirmation blocks inspection                                                        | Deferred; automated coverage tracked below                                                |
| M-INSP-02    | One failed instrument holds group; renewed cleaning and inspection retain defect evidence                     | Deferred; automated coverage tracked below                                                |
| M-INSP-03    | Passed group can be assembled; earlier inspection versions remain immutable                                   | Deferred; automated coverage tracked below                                                |
| M-UI-01      | All module screens in Spanish/English/French, mobile, keyboard, unsaved navigation                            | Deferred full manual sweep; targeted developer checks exist                               |
| M-PERSIST-01 | Full Windows restart retains all connected workflow records and history                                       | Deferred combined regression; earlier instrument persistence owner-confirmed              |
| M-AUTH-01    | Real operator/inspector/release roles, tenant/facility isolation and session expiry                           | Pending production identity/authorization integration; fixture checks do not satisfy this |
| E2E-01       | Receipt → cleaning → inspection → assembly → packaging → cycle → review/release → distribution                | Blocked by review/release and distribution; manual load/cycle records now exist           |
| E2E-02       | Failed/aborted cycle, quarantine, rework, recall and affected-item trace                                      | Blocked by later modules; must be reviewed before production acceptance                   |
| E2E-03       | Concurrent operators, corrected decisions and restart recovery throughout workflow                            | Deferred integrated review; targeted concurrency/rollback checks continue now             |
| OPS-01       | SQL Server migration/backup/restore, scale, equipment and label integrations                                  | Not implemented/validated for production; no live SQL or device connection used           |
| CLIN-01      | Approved procedures/checklists, competent roles, local rules and clinical acceptance                          | Pending client procedures and operational validation; no clinical acceptance claimed      |
| M-PACK-01    | Package proof review, failed prerequisites, duplicate package and disassembly lock                            | Deferred manual review; automated coverage continues                                      |
| M-PACK-02    | Void/repack, historical versions, stale-label prevention and physical-label removal                           | Deferred manual review; automated coverage continues                                      |
| M-LABEL-01   | Printer/media sizing, output quality, durability, actual delivery, reprints and barcode/QR scanning           | Deferred; current output is a human-readable internal preparation label                   |
| M-CYCLE-01   | Draft membership edits/cancellation, duplicate package and duplicate machine-cycle rejection                  | Deferred manual review; automated coverage recorded below                                 |
| M-CYCLE-02   | Failed/aborted cycle evidence, retained holds, immutable history and package void denial                      | Deferred manual review; automated coverage recorded below                                 |
| M-CYCLE-03   | Equipment/profile compatibility, real cycle parameters, indicator interpretation and actual device timestamps | Pending production configuration and equipment integration                                |
| M-RELEASE-01 | Independent authorized cycle review, release/reject/hold and failed-cycle disposition                         | Not implemented by this increment; pending next workflow stages                           |

## Known limitations to carry forward

See the [issues log](ISSUES.md) for explicitly deferred development requirements.

- Refresh returns to the instrument list; reopen the saved record through its
  module. Data persistence and screen-navigation persistence are different checks.
- Cleaning/inspection references and evidence are operator-entered text. There is
  no approved-procedure catalogue, evidence upload or device verification yet.
- Failed inspection holds the whole group. Split disposition, maintenance and
  corrections need later design; renewed cleaning does not itself repair damage.
- Passing inspection permits assembly, not sterilization or clinical release.
  Newly registered/legacy instruments still support the earlier composition-only
  tray demonstration; the full validated processing route is not enforced yet.
- Packaging now freezes individual passed inspection evidence and the exact source
  episode version against its saved assembly version. Legacy bare assembly records
  still require prerequisites before packaging; cycle/release linkage remains pending.
- Inspection fields are additive to preview JSON; old episodes without an
  inspection array must remain readable. SQL Server migrations are deferred.

## Inspection increment verification

**Passed November 3, 2026:** 77 current scoped automated tests (35 domain, 34
service/SQLite/HTTP, eight web API), plus scoped TypeScript and web builds.
The four launcher dispatch checks were unchanged and last passed with 58aaf13;
they were not repeated solely to increase the count.

New inspection coverage verifies exact per-instrument results, mandatory evidence
and defect reasons, pre-cleaning denial, group holds, re-cleaning/reinspection,
assembly availability after a pass, immutable historical versions, old episodes
without inspection arrays, stale/idempotent commands, replay protection for newer
holds, SQLite audit/release rollback and reopening, CSRF and viewer denial.
Fictional setup checks verify operator-only access, idempotency, original-record
preservation and atomic rollback of all setup writes.

**Developer browser smoke passed:** Spanish fictional setup → four explicit
inspection results → confirmation → saved all-pass result and inspection history.
This was a targeted new-feature check, not a repeated full-module walkthrough.
Inspection-specific mobile/EN/FR/manual failure/rework and full restart UI scenarios
remain deferred. Automated SQLite reopening passed; the previous cleaning build's
full restart result is historical evidence, not a new inspection restart check.

**Owner smoke check passed November 4, 2026:** U-INSP-01, confirmed by message and
screenshot. All other deferred scenarios remain unverified. Independent-inspector
authorization is deferred under [RSP-ISS-001](ISSUES.md#rsp-iss-001--independent-inspector-role-and-no-self-inspection).

## Packaging increment verification

**Passed November 4, 2026:** 92 scoped automated tests (43 domain, 40
service/SQLite/HTTP, nine web API), plus scoped package/web builds. Launcher source
was unchanged; its historical dispatch checks were not repeated.

New coverage verifies frozen composition/inspection proof, missing or late
inspection denial, incomplete assembly denial, one active package, disassembly
lock, explicit void/history, scope/role/CSRF/strict request fields, stale and
idempotent commands, independent-connection contention, audit/lock rollback and
SQLite reopening. Fictional setup is tested for operator-only access, original
record preservation, idempotency and atomic audit-failure rollback. Web API checks
include nested assembly scope and expected versions.

**Developer targeted browser smoke passed:** Spanish fictional setup, three
explicit confirmations, saved package and linked proof, preparation-label view,
and current-state print preflight. A programmatic label PDF was one A4 page,
contained the internal identifier and **NO ESTÉRIL · NO LIBERADO**, and excluded
workflow panels. Voiding the package through another request then blocked a stale
label's print action. This does not establish physical printer/scan validation.
No repeated full-module manual walkthrough was performed.

**Owner smoke check passed November 4, 2026:** U-PACK-01, confirmed by screenshot.
Manual void/repack, EN/FR/mobile,
full restart UI, physical printer/media and connected cycle/release checks remain
separately deferred. Independent-inspector requirement RSP-ISS-001 remains parked,
not implemented.

## Loads and cycles increment verification

**Passed November 4, 2026:** 109 scoped automated tests (51 domain, 48
service/SQLite/HTTP, ten web API), plus scoped TypeScript/web builds. Launcher
source remains unchanged; its historical dispatch checks were not repeated.

New coverage verifies load membership snapshots, draft edits/cancellation,
retained package holds after satisfactory/failed/aborted outcomes, package void
interlocks, machine-cycle reference uniqueness, invalid/duplicate/missing members,
confirmations and required evidence, stale/idempotent commands, replay safety,
foreign-scope and read-only denial, strict request fields (including release-flag
rejection), SQLite reopen persistence, concurrent claimants and audit rollback.
The real SQLite cancellation check verifies that failed audit restores every
reservation. Fictional setup is tested for CSRF/role controls, idempotency,
original-record preservation and atomic failure rollback.

**Developer targeted browser smoke passed:** Spanish fictional running-load setup,
explicit satisfactory result/evidence confirmation, saved **Pendiente de revisión
— no liberado**, visible history and package still held in the load. No real
sterilizer, numerical profile validation or clinical release was exercised.

**Owner smoke check passed November 4, 2026:** U-CYCLE-01, confirmed by screenshot.
Manual draft edits/cancellation,
failed/aborted outcomes, EN/FR/mobile, full restart UI, device evidence/indicators,
production review/release and rework remain deferred or unimplemented as listed.
The independent-inspector requirement RSP-ISS-001 remains parked, not implemented.

## Repeatable automated commands

Run only the sterile-processing packages (never the root legacy integration suite):

```sh
pnpm --filter @intrusionshield/sterile-processing test
pnpm --filter @intrusionshield/sterile-processing-service test
pnpm --filter @intrusionshield/sterile-processing-web test
pnpm --filter @intrusionshield/sterile-processing-web build
node --test scripts/sterile-preview-command.test.mjs
```

The repository test files are durable evidence of automated coverage. Browser
smoke checks and results are summarized per build here; local traces and dummy
SQLite data stay ignored. Record subsequent owner results against their specific check IDs, not against
unperformed deferred scenarios.
