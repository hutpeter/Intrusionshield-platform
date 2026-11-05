# Testing register — Ruby Sterile Processing

Updated November 5, 2026. This is the continuing register for every increment of
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

| Build                       | Delivered change                                                                                                     | Automated / developer verification                                                                                                          | Owner verification                                                                                                         | Outstanding                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 427feeb / a85508a / 9287358 | Instrument catalogue, registration, history, preview startup fixes                                                   | Scoped checks and browser flow recorded in LOCAL-PREVIEW.md; Windows pnpm launcher and cross-site entry fixes included                      | Confirmed registration of INS-DEMO-001, retained records after refresh/restart, and working preview                        | Formal retirement, auditor and language regression on Windows deferred                                                           |
| 0ac4dab                     | Tray definitions, assembly, reservations and immutable versions                                                      | 53 automated checks; browser composition/history/disassembly; restart persistence                                                           | Confirmed ARMADO-DEMO-001 completion with INS-DEMO-001, versions 1–3, and saved assembly after reopening following refresh | Manual duplicate-assignment, definition revision, disassembly/reuse and auditor regression deferred                              |
| 58aaf13                     | Receipt, cleaning attempts, failure/retry and processing holds                                                       | 69 automated checks; Spanish cleaning/retry browser workflow; EN/FR/mobile/auditor/session checks; full restart retained evidence and holds | Not yet reported. Minimal receipt smoke check offered; no result received                                                  | Receipt smoke check pending; longer manual failure/retry walkthrough deferred                                                    |
| ad63b0b                     | Individual inspection checks, held failures/rework, passed inspection enables assembly; fictional setup              | Results recorded below after verification                                                                                                   | Passed November 4, 2026 — owner confirmed with screenshot                                                                  | Failure/rework, group handling and full workflow manual review deferred                                                          |
| bee5f4d                     | Packaging with frozen tray/inspection proof, material lot, printable preparation label and explicit void             | Current results recorded below                                                                                                              | Passed November 4, 2026 — owner screenshot confirms saved label                                                            | Manual void/repack, device labels and connected cycle/release review deferred                                                    |
| e64c063                     | Draft load membership, manual start/outcome/evidence, package interlocks and held review state                       | Current results recorded below                                                                                                              | Passed November 4, 2026 — owner screenshot confirms saved awaiting-review result                                           | Manual failure/abort/rework, equipment integration and release review deferred                                                   |
| 1414949                     | Separate reviewer permission, release/hold/reject decisions, frozen evidence/history and decision label              | Results recorded below                                                                                                                      | Passed November 4, 2026 — owner screenshot confirms reviewer decision and history                                          | Manual hold/reject, identity/clinical policy, withdrawal and distribution validation deferred                                    |
| c353ff4                     | Released-package storage, transfers and issue with versioned custody history                                         | Results recorded below                                                                                                                      | Passed November 4, 2026 — owner screenshot confirms issued state and source traceability                                   | Manual storage/transfer/exception paths, returns, recall and operational acceptance deferred                                     |
| 116b939                     | Package/load withdrawal, recovery and disposition with persistent blocks                                             | 158 automated tests and scoped builds; targeted browser create/confirmation/location flow                                                   | U-RECALL-01 passed November 4, 2026                                                                                        | Manual recovery/disposition, labels, communication and operational validation deferred                                           |
| 667bd2a                     | Complete issued-package returns, reviewer quarantine/reprocessing and linked receiving episodes                      | 172 scoped automated tests, scoped builds and targeted browser return/disposition checks                                                    | U-RETURN-01 passed November 4, 2026                                                                                        | Broader manual return/disposition, partial returns, repair, recall propagation and production acceptance deferred                |
| 5d90894                     | Exact-code search, versioned source links, current holds/blocks, workflow facts and CSV export                       | 188 scoped automated tests, builds and targeted browser search/download check                                                               | U-TRACE-01 pending                                                                                                         | Broader manual history/ambiguity, regional CSV import and large-history validation deferred                                      |
| 5d69126                     | Previewed original/descendant/current-custody scope, persistent instrument blocks and explicit legacy-case extension | 205 scoped automated tests, builds and targeted browser check                                                                               | U-LINEAGE-01 passed November 5, 2026                                                                                       | Manual legacy extension, closure/reconciliation, language/mobile, physical labels and operational acceptance deferred            |
| 52cc212                     | Reviewer evidence/decision, operator admission preview, fresh linked receiving, overlap and old-package protection   | 223 scoped automated tests, builds and targeted browser verification                                                                        | U-CLEAR-01 passed November 5, 2026; U-CLEAR-02 receiving passed November 5, 2026                                           | Broader manual recovery/clearance, overlap, paused episodes, language/mobile, physical labels and production validation deferred |

| 89b59f6 | Defect hold, assessment/repair evidence and reviewer-authorized fresh receiving | 234 scoped tests, builds and developer browser lifecycle/refresh check | U-MAINT-01 passed November 5, 2026 | Broader owner repair/authorization, active-custody incidents, physical evidence and production policy deferred |

| 4a6814b | Stable internal identifier, vector Data Matrix label and current scoped lookup | 243 scoped tests, builds, independent symbol decoding and developer browser print/Enter/lookup check | U-SCAN-01 passed November 5, 2026 | Physical scanners/printers/DPM and operational scan-assisted actions deferred |

| Tray scanning increment (this commit) | Confirmed single-instrument scan into draft with type/quantity/hold gates and atomic reservation | 252 scoped tests, builds and developer browser count/duplicate/Enter/audit check | U-TRAYSCAN-01 pending | Physical scanners and owner exception/full workflow acceptance deferred |

## Current single owner check — tray scanning

**U-TRAYSCAN-01 pending:** follow [TRAY-SCANNING.md](TRAY-SCANNING.md): Demo operator →
Trays → Prepare fictional tray scan example → confirm placement → Simulate instrument
scan. Expected saved draft with assigned 1, missing 0 and Instrument added by scan.
Only this one new aspect is requested.

**Developer passed November 5, 2026:** 252 scoped tests (132 domain, 96 service/SQLite/
HTTP, 24 web API/export/symbol), scoped builds and targeted browser confirmation,
0→1 assignment, duplicate refusal, keyboard Enter and audit check. Domain/HTTP/SQLite
checks cover required type/quantity, current state/holds, ownership/version, scope,
CSRF/roles, idempotency, competing reservations, reopen and late audit rollback.
M-TRAYSCAN-01 owner exception/history/edit interaction; M-TRAYSCAN-02 Windows scanner,
ES/FR/mobile and repetition; M-TRAYSCAN-03 physical placement/full processing acceptance
remain deferred. RSP-ISS-001 remains parked. RSP-ISS-007 tracks remaining scan scope.

## Instrument scanning increment verification

**Developer verification November 5, 2026:** 243 scoped automated tests (126 domain,
94 service/SQLite/HTTP, 23 web API/export/symbol) and scoped builds. Coverage: stable
legacy/current identifier without mutation, manufacturer serial separation, exact-token
validation, foreign/unknown lookup, current maintenance/processing/retired state,
read-only roles, strict queries, CSRF-protected explicit fixture, replay-safe setup,
foreign response rejection and independent Data Matrix decoding. Targeted browser
verification passed: rendered SVG independently decoded to the exact token, print/PDF
isolated the identification label, simulation and keyboard Enter opened the correct
held instrument, invalid/unknown input stayed in lookup, and auditor lookup was read-only.
The list-loading race found during the check was fixed; lookup no longer waits on the
background instrument list. Owner acceptance is not inferred.

**Completed lookup check U-SCAN-01 passed November 5, 2026:** Demo operator → Instruments →
Prepare fictional scan example → Simulate this scan. Expected matching SCAN-DEMO
record, current-record success message and maintenance hold still visible. See
[INSTRUMENT-SCANNING.md](INSTRUMENT-SCANNING.md). No physical scanner is needed.
M-SCAN-01 real scanner/focus/keyboard suffix; M-SCAN-02 printer and physical labels;
M-SCAN-03 DPM, UDI/GS1, camera and ES/FR/mobile; M-SCAN-04 operational scan-assisted
transitions remain deferred. RSP-ISS-007 records those boundaries.

## Maintenance increment verification

**Passed November 5, 2026:** 234 scoped automated tests (121 domain, 92 service/SQLite/
HTTP, 21 web API/export), scoped builds and developer Chromium report/assessment/repair/
reviewer-authorization/fresh-receiving/refresh walkthrough. Tests cover stage sequencing,
required evidence/confirmation, role and CSRF enforcement, foreign scope, custody/recall
restrictions, no old availability, fresh processing through inspection/assembly,
idempotency, competing commands, persistence and late audit rollback. Developer browser
and automated results do not establish owner acceptance.

**U-MAINT-01 passed November 5, 2026.** Deferred M-MAINT-01: owner assessment/repair/authorization and
complete fresh-processing walkthrough; M-MAINT-02: Windows, ES/FR/mobile, stale/conflict,
failed service and multiple cycles; M-MAINT-03: real repair/function evidence, production
roles/competency, active-custody incidents, correction/retirement and vendor integration.
RSP-ISS-006 records remaining maintenance work. RSP-ISS-001 remains parked.

## Owner's completed maintenance hold check

**U-MAINT-01 passed November 5, 2026.** Follow [MAINTENANCE-REPAIR.md](MAINTENANCE-REPAIR.md): Demo
operator → Instruments → Prepare fictional maintenance instrument → Report defect
and hold → keep fictional values, confirm and save. Expected **Maintenance hold —
unavailable** with recorded defect/location. Only this one new aspect is requested.

**U-CLEAR-01 passed November 5, 2026:** owner's screenshot confirms reviewer clearance,
saved evidence and old packages blocked. **U-CLEAR-02 passed November 5, 2026:** owner's
later screenshot confirms zero instruments awaiting new receiving, linked receiving
code `RECALL-RECEIPT-B26C9FE1-5218-4102-A8A2-430387B4DD18` and **New receiving recorded**.
The missing admission button is expected after saving; duplicate admission is prevented.
These results cover the two smoke checks, not full operational/clinical acceptance.

## Owner's completed recall/reprocessing check

**U-LINEAGE-01 — Passed November 5, 2026.** Owner screenshot confirms **Record saved**,
**Recall open — issue blocked**, one blocked instrument, reviewer attribution,
version 1 and a linked reprocessed package with recovery outstanding at
**DEMO-DESCENDANT-STORE**. The earlier preview screenshot showed the two-package
impact. This confirms the save smoke check; recovery, clearance and broader
manual scenarios were not exercised.

Original single check: follow
[RECALL-LINEAGE.md](RECALL-LINEAGE.md): enter as Demo reviewer, prepare a fictional
reprocessing recall example, review the two-package impact, confirm and save.
Expected: Recall open — issue blocked, original and linked reprocessed package,
one blocked instrument and descendant location DEMO-DESCENDANT-STORE.
The prior U-TRACE-01 check remains pending; no owner result is inferred from a
developer browser check or from resuming development.

## Previously offered traceability check — pending

**U-TRACE-01 — Pending owner result.** Follow [TRACEABILITY.md](TRACEABILITY.md):
enter as Demo operator, open Traceability and reports, click Trace latest returned
package. Expected: returned package root, linked workflow records, current return
block, source links and recorded events. No export or extra manual scenario is
requested for this build.

## Owner's completed returns/reprocessing check

**U-RETURN-01 — Passed November 4, 2026.** Owner screenshot confirms **Return record saved**,
**Returned — awaiting disposition**, used condition, **DEMO-RETURN-QUARANTINE**,
operator attribution, version 1, original recipient/destination/load/review and
return history. Reviewer disposition and reprocessing were not exercised.

Original single check: follow
[RETURNS-REPROCESSING.md](RETURNS-REPROCESSING.md): enter as **Demo operator**, prepare
a fictional return, confirm complete contents and the return, then save. Expected:
**Returned — awaiting disposition**, **DEMO-RETURN-QUARANTINE**, original issue
snapshot and return history. Reviewer disposition is not requested for this check.

## Owner's completed withdrawal/recall check

**U-RECALL-01 — Passed November 4, 2026.** Owner screenshot confirms **Record saved**,
**Recall open — issue blocked**, reviewer attribution, version 1, an affected
package awaiting recovery, original location **DEMO-STORE-A** and case history.
Recovery and disposition were not exercised.

Original single check: follow [RECALLS.md](RECALLS.md): enter as
Demo reviewer, prepare the fictional recall example, confirm and save. Expected:
**Recall open — issue blocked**, with original location **DEMO-STORE-A**.

## Owner's completed storage/distribution check

**U-DIST-01 — Passed November 4, 2026.** The owner supplied an English-language
screenshot showing **Movement saved**, **Issued**, version 2, the demo destination
and recipient, and source package/load/review traceability with Demo reviewer
release attribution. This confirms the requested fictional issue smoke check.
The earlier storage prerequisite was simulated; separate manual storage, transfer
and history-version checks remain deferred.

Original single check: follow [STORAGE-DISTRIBUTION.md](STORAGE-DISTRIBUTION.md):
sign in as **Demo operator / Operador demo**, prepare a new fictional stored and
released package, confirm the prefilled handover and save the issue. Expected:
**Issued / Entregado**, destination/recipient and a retained storage-to-issue chain.
Initial storage is a simulated prerequisite; only the issue smoke check is
requested from the owner. No physical dispatch or other manual test is required.

## Owner's completed review/release check

**U-REVIEW-01 — Passed November 4, 2026.** The owner supplied an English-language
screenshot showing **Release recorded**, the saved decision attributed to
**Demo reviewer**, all four confirmed review checks and decision history. This
confirms the requested release-decision smoke check. It does not confirm physical
printing, hold/reject paths or broader production validation.

Original single check: follow [REVIEW-RELEASE.md](REVIEW-RELEASE.md): sign in
as **Demo reviewer / Revisor demo**, prepare a separate fictional review example,
choose **Release / Liberar**, confirm the four checks and reviewer confirmation,
then save. Expected: **Release recorded / Liberación registrada** with reviewer
attribution and decision history. No physical printing or other manual scenario
is requested for this build.

## Owner's completed cycle check

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

| ID            | Scenario                                                                                                      | Status / prerequisite                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| M-REG-01      | Retire instrument, reason/history retained; auditor cannot write                                              | Deferred; registration stage exists                                                                             |
| M-TRAY-01     | Duplicate reservation denied; retirement denied while assigned                                                | Deferred; automated coverage exists                                                                             |
| M-TRAY-02     | Definition revision preserves old composition; disassemble/reuse preserves history                            | Deferred; automated coverage exists                                                                             |
| M-CLEAN-01    | Failed cleaning, evidence, mechanical retry and retained earlier versions                                     | Deferred; developer browser and automated coverage exist                                                        |
| M-INSP-01     | Missing result/evidence/confirmation blocks inspection                                                        | Deferred; automated coverage tracked below                                                                      |
| M-INSP-02     | One failed instrument holds group; renewed cleaning and inspection retain defect evidence                     | Deferred; automated coverage tracked below                                                                      |
| M-INSP-03     | Passed group can be assembled; earlier inspection versions remain immutable                                   | Deferred; automated coverage tracked below                                                                      |
| M-UI-01       | All module screens in Spanish/English/French, mobile, keyboard, unsaved navigation                            | Deferred full manual sweep; targeted developer checks exist                                                     |
| M-PERSIST-01  | Full Windows restart retains all connected workflow records and history                                       | Deferred combined regression; earlier instrument persistence owner-confirmed                                    |
| M-AUTH-01     | Real operator/inspector/release roles, tenant/facility isolation and session expiry                           | Pending production identity/authorization integration; fixture checks do not satisfy this                       |
| E2E-01        | Receipt → cleaning → inspection → assembly → packaging → cycle → review/release → distribution                | Main preview stages now exist; combined manual end-to-end and production operational acceptance remain deferred |
| E2E-02        | Failed/aborted cycle, quarantine, rework, recall and affected-item trace                                      | Blocked by later modules; must be reviewed before production acceptance                                         |
| E2E-03        | Concurrent operators, corrected decisions and restart recovery throughout workflow                            | Deferred integrated review; targeted concurrency/rollback checks continue now                                   |
| OPS-01        | SQL Server migration/backup/restore, scale, equipment and label integrations                                  | Not implemented/validated for production; no live SQL or device connection used                                 |
| CLIN-01       | Approved procedures/checklists, competent roles, local rules and clinical acceptance                          | Pending client procedures and operational validation; no clinical acceptance claimed                            |
| M-PACK-01     | Package proof review, failed prerequisites, duplicate package and disassembly lock                            | Deferred manual review; automated coverage continues                                                            |
| M-PACK-02     | Void/repack, historical versions, stale-label prevention and physical-label removal                           | Deferred manual review; automated coverage continues                                                            |
| M-LABEL-01    | Printer/media sizing, output quality, durability, actual delivery, reprints and barcode/QR scanning           | Deferred; current output is a human-readable internal preparation label                                         |
| M-CYCLE-01    | Draft membership edits/cancellation, duplicate package and duplicate machine-cycle rejection                  | Deferred manual review; automated coverage recorded below                                                       |
| M-CYCLE-02    | Failed/aborted cycle evidence, retained holds, immutable history and package void denial                      | Deferred manual review; automated coverage recorded below                                                       |
| M-CYCLE-03    | Equipment/profile compatibility, real cycle parameters, indicator interpretation and actual device timestamps | Pending production configuration and equipment integration                                                      |
| M-RELEASE-01  | Independent authorized cycle review, release/reject/hold and failed-cycle disposition                         | Manual review/release preview now exists; production policy and failed-cycle disposition remain pending         |
| M-REVIEW-01   | Hold → release, reject and immutable decision history; failed/aborted cycle denial                            | Deferred manual review; automated checks recorded below                                                         |
| M-REVIEW-02   | Reviewer/operator/auditor separation and same-cycle operator release denial with real identities              | Fixture checks implemented; production identity/competency validation pending                                   |
| M-REVIEW-03   | Decision-label/current-state checks, historical labels, EN/FR/mobile and full Windows restart                 | Deferred manual review; targeted developer checks recorded below                                                |
| M-WITHDRAW-01 | Audited final-decision correction, withdrawal/recall and source amendments                                    | Deferred/unimplemented under RSP-ISS-002                                                                        |
| M-DIST-01     | Initial storage, location transfers, release/source rechecks and immutable movement versions                  | Deferred manual review; automated coverage recorded below                                                       |
| M-DIST-02     | Duplicate/concurrent issue denial, rollback, role/scope controls and real receipt acknowledgement             | Fixture/API controls tested; broader manual/operational review deferred                                         |
| M-RETURN-01   | Unopened returns versus used/opened items, restocking, new processing episode and disposition                 | Deferred/unimplemented under RSP-ISS-003                                                                        |

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

## Review/release increment verification

**Passed November 4, 2026:** 126 scoped automated tests (59 domain, 55
service/SQLite/HTTP, twelve web API), plus scoped TypeScript/web builds. Launcher
source is unchanged; its historical dispatch tests were not repeated.

New coverage verifies reviewer-only decisions and operator/viewer denial,
reviewer inability to alter operator work, same-cycle operator release denial,
failed/aborted-cycle release denial, required review evidence/checks, held-to-release
version history, terminal rejection/release, source-amendment conflicts, scope
and CSRF controls, strict bodies, stale/idempotent submissions, concurrent decisions,
SQLite persistence, atomic audit rollback and package/load review projections.
Fictional prerequisites are tested for role/CSRF protection, idempotency, unchanged
existing records and simulated operator attribution separate from the reviewer.
Web checks cover the reviewer capability and frozen-load scope/version checks.

**Developer targeted browser smoke passed:** reviewer login, fictional operator
prerequisites, explicit release checklist/confirmation, linked original package
inspection evidence, saved reviewer attribution/history and separate demonstration
release-decision label. The PDF was one A4 page, contained the decision identifier
and nonclinical demonstration warning, and omitted unrelated workflow panels.
This is not a physical-printer or clinical certificate validation.

**Owner smoke check passed November 4, 2026:** U-REVIEW-01, confirmed by screenshot.
Manual hold/reject/failure paths,
real identity/competency policies, EN/FR/mobile, full restart UI, hardware/label,
withdrawal/recall and operational acceptance remain separately deferred.
RSP-ISS-001 remains parked; RSP-ISS-002 records the unimplemented final-decision
withdrawal/correction workflow.

## Storage/distribution increment verification

**Passed November 4, 2026:** 142 scoped automated tests (67 domain, 62
service/SQLite/HTTP, thirteen web API), plus scoped TypeScript/web builds. Launcher
source is unchanged; historical dispatch checks were not repeated.

New coverage verifies storage/release linkage, transfer and issue history,
unreleased/held/rejected denial, current source/release version rechecks, no double
issue or silent restocking, stale/idempotent commands, scope/role/CSRF/strict bodies,
concurrent storage/issues, SQLite reopen persistence, foreign-key version links
and audit rollback. Source review and operator-movement attribution remain distinct.
The staged fictional setup is tested for safe resume after a storage-audit failure
without duplicate prerequisite records; earlier fictional stages may persist by design.

**Developer targeted browser smoke passed:** fictional released/stored package,
explicit integrity/handover confirmation, saved **Issued / Entregado**, destination,
recipient and retained storage-to-issue chain. The duplicate-issue action was no
longer available. No actual physical dispatch, countersigned receipt or patient
operation was performed.

**Owner smoke check passed November 4, 2026:** U-DIST-01, confirmed by screenshot.
Initial storage/transfer and exception
manual paths, real custody/receipt confirmation, EN/FR/mobile, full restart UI,
returns/reprocessing, withdrawal/recall and production acceptance remain deferred.
RSP-ISS-001, RSP-ISS-002 and RSP-ISS-003 remain separately deferred/unimplemented.

## Withdrawal/recall increment verification

**Passed November 4, 2026:** 158 scoped automated tests (76 domain, 68 service/SQLite/
HTTP, 14 web API), plus scoped TypeScript/web builds. New checks cover package and
whole-load scope, original custody snapshots, persistent blocks after closure,
overlaps, recovery prerequisites, disposition, permissions, tenant/facility isolation,
CSRF/strict bodies, idempotency/version conflicts, SQLite reopen, audit rollback and
issue-versus-recall concurrency. Original final release and movement facts persist.

**Developer browser smoke passed:** reviewer login, fictional stored-package setup,
disabled save before confirmation, explicit confirmation, saved open recall and
original DEMO-STORE-A location. This does not confirm the owner's Windows workflow.

**Deferred manual checks:** M-RECALL-01 operator recovery and reviewer disposition;
M-RECALL-02 load-wide/overlapping recalls and concurrent issue; M-RECALL-03 stale
browser labels and physical label handling; M-RECALL-04 communications, physical
recovery and operational acceptance. Automated coverage does not mark these manual
checks passed. U-RECALL-01 passed by owner screenshot; recovery and disposition remain deferred. Full connected workflow, returns and
reprocessing remain deferred. RSP-ISS-002 is partially implemented; independent
inspection RSP-ISS-001 remains parked.

## Returns/reprocessing increment verification

**Passed November 4, 2026:** 172 scoped automated tests (84 domain, 73 service/SQLite/
HTTP, 15 web API), plus scoped TypeScript/web builds. New checks cover issued-source
and version requirements, complete-content confirmation, unopened quarantine,
damaged/recalled reprocessing denial, permanent old-package blocks, unchanged issue
and release facts, atomic assembly closure and processing-hold transfer, linked
receiving history, subsequent new cleaning/inspection/packaging, actor permissions,
scope/CSRF/strict bodies, idempotent setup, SQLite reopen and competing connections.

An initial SQLite check found that a multi-entity transition reused the unique
audit request ID. Fixed using unique child audit IDs with parent command correlation;
rechecked audit rollback at processing creation and the complete transfer. Final
scoped automated checks passed; no known failing check is being marked deferred.

**Developer browser smoke passed:** English operator return, explicit contents and
return confirmations, retained original issue/destination, saved held return,
reviewer disposition and linked new receiving episode. A second reviewer browser
with an already-open decision label rechecked the return and refused printing
(print invocation count zero). Browser evidence stays local
and ignored; it does not constitute the owner's Windows check.

**Deferred manual checks:** M-RETURN-01 unopened/opened/damaged and quarantine paths;
M-RETURN-02 reviewer reprocessing through new packaging/issue; M-RETURN-03 stale
labels, physical custody and multi-user conflicts on Windows; M-RETURN-04 full restart,
ES/FR/mobile and operational acceptance. U-RETURN-01 passed by owner screenshot; reviewer disposition and reprocessing remain manually deferred. Partial returns,
repair, quarantine clearance and later recall propagation are unimplemented, tracked
in RSP-ISS-003/004. RSP-ISS-001 remains parked. No bulk owner testing is requested.

## Traceability/reporting increment verification

**Passed November 4, 2026:** 188 scoped automated tests (92 domain, 78 service/SQLite/
HTTP, 18 web API/export), plus scoped TypeScript/web builds. New coverage verifies
exact normalized/ambiguous code search, source kinds and versions, linked return and
new receiving episodes, current blocks alongside unchanged historical release,
removed assembly members, prior load membership, co-load context boundaries,
unavailable referenced snapshots, scope and dedicated read-permission denial,
SQLite reopen, read-only behavior, strict query inputs, explicit snapshot/event
limits, CSV quoting/formula neutralization and complete exported sections.

**Developer browser smoke passed:** English operator login, read-only latest-returned
package shortcut, receiving-through-return records, current blocks/source links,
CSV download with root code and return/issue links, and unknown exact-code search
clearing the old report/export action. This is not an owner Windows result.

**Deferred manual checks:** M-TRACE-01 explicit searches across every root kind,
ambiguous codes and historical-version inspection; M-TRACE-02 ES/FR/mobile and
Excel/LibreOffice regional import; M-TRACE-03 concurrent workflow changes, generation
cutoffs and large-history behavior; M-TRACE-04 operational source completeness and
full connected workflow acceptance. U-TRACE-01 remains pending. Reports do not
implement recall propagation (RSP-ISS-004) or resolve independent inspection
(RSP-ISS-001). No broad owner regression is requested.

## Recall/reprocessing-lineage increment verification

**Passed November 5, 2026:** 205 scoped automated tests (103 domain, 83 service/SQLite/
HTTP, 19 web API/export), plus scoped builds. New checks cover multi-generation
return/episode/inspection-proof traversal, unrelated-instrument exclusion, current
custody without explicit return links, stale impact after issue, successful-inspection
hold retention, assembly/packaging gates, persistent blocks after closure, overlapping
cases, explicit legacy extension and preserved old dispositions/versions, idempotency,
scope/role/CSRF/strict bodies, SQLite reopen, atomic audit rollback, concurrent package
creation and competing-connection issue/recall behavior. Oversized scope fails before
saving a partial case. The fictional helper's replay and role controls are tested.

**Developer browser smoke passed:** reviewer login, fictional reprocessing setup,
two-package impact preview, explicit confirmation, saved original/descendant recall,
retained descendant storage reference, invalidation of an already-open descendant
release label (zero print invocations), instrument recall visible in traceability,
and no-op extension disabled. Historical return/custody context is shown separately.

**Deferred manual checks:** M-LINEAGE-01 extension of open/closed older cases and
version/disposition walkthrough; M-LINEAGE-02 concurrent users and stale previews
on Windows; M-LINEAGE-03 ES/FR/mobile, physical recovery and printed-label handling;
M-LINEAGE-04 full connected operational acceptance and approved clearance/separation
policies. U-LINEAGE-01 passed by owner screenshot. U-TRACE-01 remains pending. RSP-ISS-004 is now
partially implemented in the local preview; RSP-ISS-001 remains parked. No larger
owner regression is requested for this build.

## Authorized recall clearance increment verification

**Passed November 5, 2026:** 223 scoped automated tests (114 domain, 89 service/SQLite/
HTTP, 20 web API/export), plus scoped TypeScript/web builds. New coverage verifies
closed/reconciled/reprocessing dispositions, required evidence and checks, legacy
upgrade requirement, immutable prior versions, dedicated reviewer/operator permissions,
scope/CSRF/strict bodies, current version/hash checks, independent overlapping cases,
complete mixed-group holds, zero-assumption fresh receiving and subsequent new cleaning/
inspection/packaging, paused-episode supersession, running cleaning/cycle denial,
idempotent retries, competing commands/connections, reopen persistence and late audit
rollback of gate rows, custody and episode creation. Old package/label blocks persist.
Lineage traverses clearance-created receiving episodes for subsequent recalls.

**Developer browser verification passed November 5, 2026:** reviewer clearance and
operator admission checked separately, including explicit checks/confirmation, fresh
receiving with zero cleaning attempts, processing holds and old release-label denial.
This does not constitute the owner's Windows result.

**Deferred manual checks:** M-CLEAR-01 real recovery/historical reconciliation and
approved clearance evidence; M-CLEAR-02 overlapping/older cases, mixed groups and paused
receiving episodes on Windows; M-CLEAR-03 ES/FR/mobile, custody, physical labels and
complete new processing-to-issue walkthrough; M-CLEAR-04 production identity/competency,
clinical policies, cross-site operations and batching beyond the preview limit.
U-CLEAR-01 and U-CLEAR-02 passed November 5, 2026 as recorded above. RSP-ISS-001 remains parked; RSP-ISS-005 tracks remaining
clearance/exception policy work. No bulk owner regression is requested.

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

## Recall preview wording correction

The unsaved impact preview now says “Instruments that will be blocked” in ES/EN/FR.
Saved cases retain “Blocked instruments.” This wording change does not alter blocks
or workflow behavior; scoped web build verification applies.

## Maintenance confirmation layout correction — November 5, 2026

Owner U-MAINT-01 remains pending: screenshot showed the confirmation checkbox separated
from its text by the default full-width input styling, with Save correctly disabled.
Both maintenance confirmation labels now use the existing checkbox-row style. Targeted
developer Chromium verification checks a 17px checkbox aligned with its label, clicking
label text selects it and enables Save, and saving works through all maintenance stages.
Scoped builds passed. Broader deferred manual checks remain unchanged.

## Owner maintenance hold result — November 5, 2026

U-MAINT-01 passed: owner screenshot confirms **Maintenance hold — unavailable**,
**SIMULATED damaged hinge**, **DEMO-MAINT-QUARANTINE**, updated timestamp and a
**Defect recorded** audit entry attributed to Demo operator. Instrument code:
`MAINT-DEMO-A151A482-A934-4850-BE63-ACE1502C0FD0`. The **Record assessment** action
is now available. This confirms defect/hold saving only; owner assessment, repair,
authorization and full reprocessing remain deferred. No checkbox-layout update
acceptance is inferred from this screenshot of the saved record.

## Owner simulated scan result — November 5, 2026

U-SCAN-01 passed: owner screenshots show the fictional Data Matrix label, followed by
the matching `SCAN-DEMO-C6E99996-11F5-4E9F-A542-FDCED5A59FD1` instrument detail,
current-record success message, maintenance hold and saved fictional defect/history.
This confirms simulated identifier lookup and current hold display in Spanish. It
does not establish physical scanner, printed-label or operational scan-action acceptance.
M-SCAN-01 through M-SCAN-04 remain deferred.
