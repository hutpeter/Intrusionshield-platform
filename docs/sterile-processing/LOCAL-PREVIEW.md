# Standalone instrument-management preview

November 3, 2026. Development branch: `feature/sterile-processing-preview`, based
on the published standalone foundation branch. This increment adds an actual
Spanish-first web application and a durable **dummy-data development preview**.
Athena, SQL Server, Docker and existing Ruby databases are not required or accessed.

Tray definitions, composition checks, assignment reservations and assembly history
are now available. See the [tray walkthrough](TRAYS.md) for the next steps using
your existing demonstration instrument.

See [receiving and cleaning](RECEIVING-CLEANING.md) for the next workflow, using a
new dummy instrument while keeping the completed demonstration tray intact.

See [inspection](INSPECTION.md) for the latest single smoke check and the
[testing register](TESTING-REGISTER.md) for completed and deferred verification.

See [packaging and labels](PACKAGING.md) for the latest one-check walkthrough.

See [loads and cycles](LOADS-CYCLES.md) for the current single smoke check.

See [review and release decisions](REVIEW-RELEASE.md) for the current single check.

See [storage and distribution](STORAGE-DISTRIBUTION.md) for the current single check.

## What works

- Receiving episodes, attributed cleaning attempts, failure/retry evidence and holds pending inspection.
- Spanish, English and French screens and validation messages; Spanish is default.
- Tray definitions with immutable revisions, assembly contents and explicit completion/disassembly.
- Instrument-type catalogue with code, name, manufacturer and model.
- Individual instrument registration, type selection and optional serial number.
- Instrument details, server-recorded dates and scoped audit history.
- Explicit retirement confirmation/reason; historical records remain visible.
- Scoped, bounded lists, page navigation and filtering of the current page.
- Operator and read-only auditor demonstration profiles, logout and session expiry.
- Durable local SQLite records, audit and retry receipts across restarts.
- Same-origin browser sessions with HttpOnly/SameSite cookies, CSRF checks,
  host/origin validation and no browser-stored bearer token.

Registration is not sterilization or clinical release. No patient, clinical-release, equipment-control or Athena integration endpoint is enabled. Cycle endpoints record manual evidence only.
The yellow banner identifies the local dummy-data mode on every screen.

## Start on the owner's Windows machine

The current working folder is:
`D:\Projects\Latest\CMS\NodeJS\Versions\intrusionshield-platform`.
Use **PowerShell** with Node.js 24+ and the repository's pnpm configuration:

```powershell
cd "D:\Projects\Latest\CMS\NodeJS\Versions\intrusionshield-platform"
git status --short --branch
git fetch origin
git switch feature/sterile-processing-preview
pnpm install --frozen-lockfile --ignore-scripts --filter @intrusionshield/sterile-processing --filter @intrusionshield/sterile-processing-service --filter @intrusionshield/sterile-processing-web
pnpm sterile:preview
```

Do not discard local changes if Git refuses the switch. The owner's untracked
`i18n-shared-integration-current/database-isolation/`,
`i18n-shared-integration-current/services/`, `jest.config.mjs`, and
`ruby-test-results.txt` were not transferred or changed here. This branch does
not replace those paths. Run one instance of this preview at a time.

Wait for **Ready: http://127.0.0.1:9553**, then open that address. The launcher
builds only the three sterilization packages and starts a separate explicitly
opted-in development server. It refuses a pre-existing nondevelopment NODE_ENV;
it does not override it, read SQL connection configuration or run migration tools.
Stop with **Ctrl+C**. Port 9553 is fixed and binds only to literal `127.0.0.1`;
`localhost`, a LAN address and remote deployment are not supported by this fixture.
It never kills another process if the port is occupied.

For Ubuntu/WSL users, open it from PowerShell with `wsl -d Ubuntu`, then use an
existing Linux clone and the same `pnpm` commands. The Windows steps above do not
require WSL, Docker or the separate TMS preview.

## First walkthrough

1. Open the preview. Keep **Español** or choose English/French.
2. Choose **Operador demo** and **Entrar a la demostración**. No existing Ruby,
   Athena or TMS account/password is requested by this isolated fixture.
3. Open **Tipos de instrumental → Crear tipo**. Enter a unique dummy code such
   as `PINZA-DEMO`, name `Pinza quirúrgica`, and optional manufacturer/model.
   Select **Guardar tipo**.
4. Open **Instrumentos → Registrar instrumento**. Enter `INS-DEMO-001`, select
   the saved type, add an optional dummy serial number, and save.
5. Review the instrument details and history. Reload the page; the record remains.
6. Choose **Retirar del servicio**. Enter a dummy reason, check the confirmation,
   then **Confirmar retiro**. The record remains and its history includes the event.
7. Select **Salir**, then choose **Auditor demo**. Confirm you can read records
   and history but cannot create or retire instruments. Server authorization also
   rejects mutations even if someone bypasses the hidden buttons.
8. Stop with Ctrl+C and start again. The catalogue, instruments, retirement and
   audit remain; enter a demo profile again if the old in-memory session expired.

Use new codes if earlier dummy records already exist. A duplicate code is rejected
and the form is retained. When a save outcome is uncertain, reload and inspect
records before starting a new operation. Identical retries reuse an operation ID;
changed data with an already-used ID is rejected. Closing a dirty form/navigation
asks for confirmation; refreshing/closing the browser also protects unsaved edits.

## Storage and development isolation

Data: `work/sterile-processing-preview/registry.sqlite` under this clone, with WAL
sidecars. This directory is ignored by Git. POSIX directories/files are private
and symlinks are refused; Windows users should keep the local project under their
normal private account controls. No real patient or clinical data belongs here.
Nothing resets/deletes records automatically. A new clone has a separate dataset.

SQLite is **not** a replacement decision for Ruby's production SQL Server design.
It is an explicit development-only adapter, with transactional state+audit+receipt,
foreign keys, scoped uniqueness, versions and bounded lists. The adapter/server
refuse operation unless NODE_ENV=development and RUBY_STERILE_PREVIEW=true; only
the dedicated launcher opts in. The production Express factory remains unchanged
apart from the scoped history route and still fails closed without its adapters.

The local role/entitlement fixtures do not verify a real Ruby identity provider,
production licensing, membership or facility provisioning. Production composition
must supply those verified adapters and durable SQL storage. Local opaque sessions
are server-held, rotate on login/logout and expire after 30 minutes without
sliding extension. The loopback preview uses HTTP; it is not a production TLS or
network-access configuration. Internal bridge credentials never reach JavaScript.

The initial UI loads up to 1,000 type options and 50 rows per page. Type and
instrument history stay linked by scoped IDs; no client-supplied tenant or actor
becomes authority. Dates use the preview facility's America/Lima setting; real
facility configuration remains a production integration task.

## Developer checks

```sh
pnpm --filter @intrusionshield/sterile-processing test
pnpm --filter @intrusionshield/sterile-processing-service test
pnpm --filter @intrusionshield/sterile-processing-web build
pnpm --filter @intrusionshield/sterile-processing-web test
```

These checks use synthetic data, temporary local SQLite and loopback HTTP only.
Do not run recursive root tests or existing SQL integration/migration scripts as a
substitute. The scoped GitHub workflow includes the new web build/tests.

## Remaining product work

Dedicated SQL Server repository and production identity/facility/entitlement
composition; durable operational sessions; tray versions/assembly; receipt,
cleaning and packaging; approved quality/release profiles; recall and inventory;
qualified clinical validation and optional vendor/HIS adapters remain later work.
See the draft SRS and questionnaire; formal procurement requirements are still
needed before a tender-compliance claim.

## Verification — November 3, 2026

- Filtered frozen-lockfile install passed with lifecycle scripts disabled. The
  lockfile adds only the new web importer; no existing third-party resolutions
  changed. Runtime: Node 24.19.0 and available pnpm 11.25.0; repository pin remains
  11.20.0, to be exercised separately by CI.
- All three scoped builds passed. Automated tests: **27 passed** — domain 9,
  service/storage/session 14, browser API/localization 4. Service tests include
  temporary SQLite reopen/persistence, scope boundaries, audit rollback,
  idempotency, versions, history, private paths, CSRF/origin/host checks,
  session rotation/revocation/expiry, and read-only role denial.
- Chromium against the running local application passed Spanish type creation,
  English instrument registration, French detail/history and retirement,
  unsaved-edit confirmation, duplicate-error draft retention, reload persistence,
  auditor viewing and server write denial, Spanish mobile width checks, and
  clearing the workspace after a lost session. No page errors were reported.
- Full launcher stop/start retained the instrument, retirement and audit;
  in-memory sessions reset as expected. Ctrl+C released port 9553 after the
  launcher was corrected to stop owned child processes/groups and detect lost
  package-manager wrappers. Other services were not stopped.
- Changed-file formatting, JavaScript syntax and Git whitespace checks passed.
  No SQL Server, live provider, hardware, production migration/deployment or
  clinical process validation was performed. Preview services were stopped;
  ignored dummy data remains available for the next run.

This is initial implementation evidence for instrument management, audit,
localization and a development-only storage/session boundary. It does not complete
the entire SRS or establish formal clinical/tender acceptance. Physical Windows
startup has not been independently run in this Linux environment.

## Windows native pnpm launcher correction

The owner's Windows installation supplies `npm_execpath` as a native `pnpm.exe`,
not a JavaScript pnpm CLI. The original launcher incorrectly passed that path to
Node and failed with `ERR_UNKNOWN_FILE_EXTENSION: .exe`. The launcher now spawns
native `.exe` paths directly, while JavaScript pnpm paths remain under Node.
Arguments are passed as arrays without enabling a command shell. The application
server itself still launches through Node.

Four focused regression checks cover native Windows paths (including spaces),
JavaScript launchers, actual direct execution of a `.exe`-named test executable on
Unix, and argument preservation. Existing application dependencies are unchanged.
The corrected complete startup was checked on Linux; physical Windows execution
requires the owner's retry. The scoped CI workflow includes the launcher checks.

## Opening a link from chat

The original preview rejected a browser's `Sec-Fetch-Site: cross-site` header even
for the initial public HTML page. That could show `FORBIDDEN` immediately when
following the correct `http://127.0.0.1:9553/` link from chat. The guard now accepts
only GET/HEAD top-level document navigation to `/` on the exact configured host.
It does not exempt session endpoints, API reads, writes, embedded iframes, forged
hosts/origins or ordinary cross-site fetches. No authorization/CSRF rule for data
access was relaxed. Typing/pasting the address into the address bar also avoids
the original navigation problem.

The service suite now has 16 passing checks, including positive entry-page
navigation and negative API/iframe/host/origin/write regressions. A real Chromium
click from a different local site confirmed a cross-site document request returns
HTTP 200, loads the welcome screen and can enter the operator demonstration.

## Withdrawal/recall update

See [RECALLS.md](RECALLS.md) for separate recall cases, recovery and disposition.
Original release decisions remain immutable; current recall blocks override
availability and normal label printing. Correction and reinstatement remain deferred.

## Returns/reprocessing update

See [RETURNS-REPROCESSING.md](RETURNS-REPROCESSING.md) for the operator's single
return check and the separate reviewer disposition workflow. Original packages
remain blocked; a new linked receiving episode is required for reprocessing.

## Traceability/reporting update

See [TRACEABILITY.md](TRACEABILITY.md) for exact-code search, current blocks alongside
historical evidence, source versions and CSV export. The latest-return shortcut is
read-only and uses the records already saved during the owner's return check.

## Recall lineage update — November 5, 2026

See [RECALL-LINEAGE.md](RECALL-LINEAGE.md) for impact preview, descendant/current-custody
package blocks, persistent instrument blocks and explicit extension of older cases.
New cases use this policy; existing saved cases are not silently migrated.

## Authorized recall clearance update

See [RECALL-CLEARANCE.md](RECALL-CLEARANCE.md) for the reviewer’s single clearance
check and the separate operator fresh-receiving workflow. Old packages/labels remain
blocked; current instrument restrictions require clearance and admission, then fresh
cleaning/inspection before assembly. Existing records and older versions are retained.

## Instrument maintenance and repair

See [MAINTENANCE-REPAIR.md](MAINTENANCE-REPAIR.md) for the fictional instrument setup,
defect hold, assessment/repair evidence and reviewer-authorized fresh receiving.

## Instrument Data Matrix labels and lookup

Run `pnpm install --frozen-lockfile` for the new encoder dependency, then see
[INSTRUMENT-SCANNING.md](INSTRUMENT-SCANNING.md) for the one simulated-scan check.

## Scan-assisted tray assembly

See [TRAY-SCANNING.md](TRAY-SCANNING.md) for a fictional eligible instrument/draft
setup and the one confirmed scan-add check. No scanner hardware is needed.

## Scanned receiving list

See [RECEIVING-SCANNING.md](RECEIVING-SCANNING.md): stage a fictional scanned instrument,
then explicitly confirm and save its receiving episode. No scanner hardware is required.
