# Testing register — Ruby Sterile Processing

Updated November 3, 2026. This is the continuing register for every increment of
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

| Build                                  | Delivered change                                                                                        | Automated / developer verification                                                                                                          | Owner verification                                                                                                         | Outstanding                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 427feeb / a85508a / 9287358            | Instrument catalogue, registration, history, preview startup fixes                                      | Scoped checks and browser flow recorded in LOCAL-PREVIEW.md; Windows pnpm launcher and cross-site entry fixes included                      | Confirmed registration of INS-DEMO-001, retained records after refresh/restart, and working preview                        | Formal retirement, auditor and language regression on Windows deferred                              |
| 0ac4dab                                | Tray definitions, assembly, reservations and immutable versions                                         | 53 automated checks; browser composition/history/disassembly; restart persistence                                                           | Confirmed ARMADO-DEMO-001 completion with INS-DEMO-001, versions 1–3, and saved assembly after reopening following refresh | Manual duplicate-assignment, definition revision, disassembly/reuse and auditor regression deferred |
| 58aaf13                                | Receipt, cleaning attempts, failure/retry and processing holds                                          | 69 automated checks; Spanish cleaning/retry browser workflow; EN/FR/mobile/auditor/session checks; full restart retained evidence and holds | Not yet reported. Minimal receipt smoke check offered; no result received                                                  | Receipt smoke check pending; longer manual failure/retry walkthrough deferred                       |
| Inspection increment (see Git history) | Individual inspection checks, held failures/rework, passed inspection enables assembly; fictional setup | Results recorded below after verification                                                                                                   | Pending — one check specified below                                                                                        | Failure/rework, group handling and full workflow manual review deferred                             |

## Owner's single check for the inspection build

**U-INSP-01 — Pending.** In **Recepción y limpieza**, choose **Preparar ejemplo
ficticio de inspección**, then **Registrar inspección**. Enter dummy procedure
`INSPECT-DEMO`, version `1`, evidence `EVID-INSP-DEMO`. Choose **Conforme** for the
four checks, confirm and save. Expected: **Inspección satisfactoria — disponible
para armado**. Report only whether this result appeared; no further manual tests
are requested for this build. The setup creates separate fictional records and
simulated cleaning; it does not perform cleaning or alter existing demo records.

## Deferred manual scenarios and their release gates

| ID           | Scenario                                                                                       | Status / prerequisite                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| M-REG-01     | Retire instrument, reason/history retained; auditor cannot write                               | Deferred; registration stage exists                                                       |
| M-TRAY-01    | Duplicate reservation denied; retirement denied while assigned                                 | Deferred; automated coverage exists                                                       |
| M-TRAY-02    | Definition revision preserves old composition; disassemble/reuse preserves history             | Deferred; automated coverage exists                                                       |
| M-CLEAN-01   | Failed cleaning, evidence, mechanical retry and retained earlier versions                      | Deferred; developer browser and automated coverage exist                                  |
| M-INSP-01    | Missing result/evidence/confirmation blocks inspection                                         | Deferred; automated coverage tracked below                                                |
| M-INSP-02    | One failed instrument holds group; renewed cleaning and inspection retain defect evidence      | Deferred; automated coverage tracked below                                                |
| M-INSP-03    | Passed group can be assembled; earlier inspection versions remain immutable                    | Deferred; automated coverage tracked below                                                |
| M-UI-01      | All module screens in Spanish/English/French, mobile, keyboard, unsaved navigation             | Deferred full manual sweep; targeted developer checks exist                               |
| M-PERSIST-01 | Full Windows restart retains all connected workflow records and history                        | Deferred combined regression; earlier instrument persistence owner-confirmed              |
| M-AUTH-01    | Real operator/inspector/release roles, tenant/facility isolation and session expiry            | Pending production identity/authorization integration; fixture checks do not satisfy this |
| E2E-01       | Receipt → cleaning → inspection → assembly → packaging → cycle → review/release → distribution | Blocked by packaging, cycles, release and distribution not yet implemented                |
| E2E-02       | Failed/aborted cycle, quarantine, rework, recall and affected-item trace                       | Blocked by later modules; must be reviewed before production acceptance                   |
| E2E-03       | Concurrent operators, corrected decisions and restart recovery throughout workflow             | Deferred integrated review; targeted concurrency/rollback checks continue now             |
| OPS-01       | SQL Server migration/backup/restore, scale, equipment and label integrations                   | Not implemented/validated for production; no live SQL or device connection used           |
| CLIN-01      | Approved procedures/checklists, competent roles, local rules and clinical acceptance           | Pending client procedures and operational validation; no clinical acceptance claimed      |

## Known limitations to carry forward

- Refresh returns to the instrument list; reopen the saved record through its
  module. Data persistence and screen-navigation persistence are different checks.
- Cleaning/inspection references and evidence are operator-entered text. There is
  no approved-procedure catalogue, evidence upload or device verification yet.
- Failed inspection holds the whole group. Split disposition, maintenance and
  corrections need later design; renewed cleaning does not itself repair damage.
- Passing inspection permits assembly, not sterilization or clinical release.
  Newly registered/legacy instruments still support the earlier composition-only
  tray demonstration; the full validated processing route is not enforced yet.
- Explicit linkage of a specific passed inspection version into downstream
  assembly/packaging records remains part of connected-workflow development.
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

**Owner result remains pending:** U-INSP-01. No deferred scenario has been marked
passed merely because development continued.

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
SQLite data stay ignored. Record the next owner response against U-INSP-01, not
against the deferred manual scenarios.
