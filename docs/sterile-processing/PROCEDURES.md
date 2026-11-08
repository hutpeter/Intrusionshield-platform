# Versioned processing procedures

## One new owner check

**U-PROC-01 passed November 8, 2026:** owner screenshot confirms publication, Revision 1 and Decision history. Original check: after updating the preview, sign out and enter as **Demo reviewer**.
Open **Processing procedures** → **Prepare fictional procedure revision**. Review the
placeholder text, click **Publish revision**, tick the confirmation, then click the form's
**Publish revision** button. The fictional decision rationale is prefilled.

Expect **Published**, **Revision 1**, the saved instructions/source/applicable type, and
**Decision history** with the publication. Only this new publication aspect is requested.
Selection and saved workflow snapshots are developer-verified; no manual cleaning,
inspection or cycle walkthrough is requested in this build. The setup creates a new
fictional instrument/received episode and draft; it never publishes on the owner's behalf.
No real clinical instructions or equipment parameters are supplied by the example.

## Library and applicability

A revision has a stable ID, code, numeric library revision, title, stage/method, plain-text
instructions, manually entered procedure/manufacturer source reference and 1–100 applicable
local instrument-type IDs. Cleaning supports manual/mechanical, inspection uses inspection,
and sterilization supports steam/low-temperature/other. Stage/method compatibility and
local type existence are validated. Clinical suitability, manufacturer authenticity and
machine parameter compatibility are not verified by this software.

Creating the same code produces its next numeric revision; the stage cannot change within
a code. Content is immutable from draft creation. Correct a draft by creating another
revision. Reviewer publication makes a revision available for controlled selection; explicit
withdrawal removes it from new controlled work. Lifecycle versions and decision reasons/
actors remain auditable. A withdrawn revision cannot be republished; create a new revision.
New publication does not automatically withdraw older published revisions: they remain
selectable until explicitly withdrawn. There is no implicit latest-version substitution.

The numeric library revision is distinct from the record's lifecycle version and from any
manufacturer version included in the source reference. Procedure instructions support
plain multiline text, up to 16,000 characters, and are rendered without HTML execution.
No attachment import, external link fetching, signature service or notification is performed.

## Workflow links and saved evidence

The optional **Controlled procedure revision** selector appears for cleaning start,
inspection recording and draft-load creation. Published revisions are listed by stage;
processing selectors also filter the episode's instrument types. Selection fills the
reference/version and method and displays the instruction text. The server rechecks scope,
publication state, stage/method, exact reference/version and every affected instrument type
inside the workflow transaction. Client-supplied instruction snapshots are not accepted.

- Cleaning start stores the full selected revision in the attempt.
- Inspection stores it in the inspection record.
- Draft-load creation stores the profile revision and checks its current package types.
  Cycle start checks it again against the complete current load, so withdrawal or an
  incompatible added package blocks starting. Cancel/remove incompatible draft membership
  or create a new load with the appropriate profile; no silent fallback is supplied.

Saved revisions retain ID, library revision, content, source, applicability and publication
attribution. Later publication/withdrawal cannot rewrite earlier attempts, inspections or
load versions. Current/historical workflow views and traceability show the saved text and
source. Withdrawals do not retroactively recall packages, revoke releases, stop equipment,
or prevent recording an already-running cycle's result. Those require separate reviewed
incident/release policies; this module is not machine control or clinical validation.

**Manual reference — not linked to the procedure library** preserves the previous input
contract. Old records are not automatically linked by matching a code string. Selecting a
controlled revision is optional in this preview; manual references do not gain controlled
status, and no institution-wide mandatory SOP policy is claimed. Requiring controlled
revisions by type/stage/facility, effective dates and exception permissions remains a
production policy gate. Independent cleaner/inspector separation remains parked separately
under RSP-ISS-001; publishing a procedure does not implement it.

## API, access and persistence

- `GET /procedures?page=1`, `/procedures/:id`, `/procedures/:id/history?page=1` and
  `/procedures/:id/versions/:version` require `procedures:read`.
- `GET /procedures/available/:stage?page=1` returns only published stage revisions.
  Lists use 50-row pages. Selectors explicitly fail rather than silently truncate above
  1,000 revisions; larger libraries need an expanded search/paging interface.
- `POST /procedures` requires `procedures:write`; preview operator/reviewer can draft.
  `POST /procedures/:id/publish` or `/withdraw` requires `procedures:publish`; preview
  reviewer alone can perform these actions. There is no independent-author/publisher
  identity rule in this increment; production approval/competency policy is still pending.
- Workflow inputs accept optional `procedureRevisionId` and require procedure read access
  when it is supplied. Existing manual inputs remain valid and extra fields remain denied.
  All browser writes retain origin/CSRF, actor binding, exact bodies and tenant/facility scope.
- Commands have retry receipts, current-version checks, audit and immutable lifecycle
  versions. Late audit errors roll back state, workflow writes and receipts. SQLite
  development tables `sp_procedures` and `sp_procedure_versions` extend the preview schema;
  existing historical records are not rewritten. This is not a production database adapter.

## Verification and deferred work

Developer November 8, 2026: 334 scoped tests (180 domain, 119 service/SQLite/HTTP, 35 web),
scoped builds and targeted browser verification passed. Coverage includes sequential immutable
revisions, publication/withdrawal, scope/roles/CSRF/source-read grants, wrong stage/method/type/
reference and draft/withdrawn refusal, frozen cleaning/inspection/load snapshots, withdrawal
before cycle start, legacy request compatibility, optimistic races/idempotency/audit rollback,
SQLite reopening and historical versions/trace facts. Browser checks cover reviewer draft
publication/decision history, applicable operator cleaning selection, exact saved instruction
snapshot, withdrawal removing future selection and saved text surviving refresh.

U-PROC-01 passed November 8, 2026 (owner screenshot). M-PROC-01: owner inspection/sterilization selection, withdrawal,
old-published/new-revision choice, mismatch/error/retry/concurrency/history/trace walkthroughs.
M-PROC-02: instruction readability, Windows/ES/FR/mobile/accessibility, large libraries and
physical SOP/approved-manufacturer/equipment/competency/operational acceptance. Mandatory
SOP policies and effective/expiry/amendment rules remain deferred under RSP-ISS-012.
No owner pass is inferred for earlier unconfirmed checks.
