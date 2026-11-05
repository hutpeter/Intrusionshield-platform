# Authorized recall clearance and fresh receiving — local preview

Updated November 5, 2026. Clearance authorizes a new reprocessing path. It does not
restore an old package, release label, stock movement or clinical-use authorization.
The reviewer decision and the operator's receiving admission are separate actions.

## Update and run

Stop the running preview with Ctrl+C in PowerShell, then run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for Ready, keep PowerShell running and refresh http://127.0.0.1:9553.

## One owner check — U-CLEAR-01

1. Enter as **Demo reviewer / Revisor demo**.
2. Open **Withdrawal and recall / Retiradas y recuperación**.
3. Click **Prepare fictional recall clearance example / Preparar ejemplo ficticio de autorización tras retirada**.
4. Click **Record clearance for reprocessing / Registrar autorización para reprocesamiento**.
5. Keep the prefilled simulated resolution/evidence/procedure. Check the four review
   statements and the authorization confirmation, then click **Save clearance decision**.

Expected: **Cleared for new reprocessing — old packages blocked**, saved resolution,
evidence, approved procedure/version, reviewer attribution and instruments awaiting
new receiving. This is the only requested owner check for this build.

The helper creates separate fictional ancestor/descendant packages, a recall and
simulated recovery/historical reconciliation and **Reprocessing required** dispositions.
It does not perform physical recovery or inspection. Your clearance remains an
explicit decision; the helper never records it automatically. Existing records are
retained. Operator admission is a later step, not another requested owner test now.

## Reviewer clearance

The dedicated `recall:clear` permission is required. The current case version must:

- Be closed with every target reconciled/recovered and disposed as **Reprocessing required**.
- Have the instrument-blocking lineage policy (extend older cases first).
- Have no previous clearance decision or newly discovered unreviewed package targets.

The reviewer records a resolution, evidence reference, approved reprocessing procedure
and version, four checks and confirmation. The decision freezes original instrument
IDs, actor, timestamp and case version. Earlier case/item/recovery/disposition versions
are preserved. Quarantine/discard dispositions are not eligible for this shortcut;
correction, partial clearance and repair policies remain future work.

Closing alone never lifts a hold. Clearance alone also does not permit assembly or
packaging: instrument restrictions remain until a fresh receiving admission is saved.
A cleared case cannot be extended or silently amended; a new incident requires a new
recall, retaining the earlier history.

## Operator receiving admission

The separate `recall:admit` permission is required. On a cleared case, Demo operator
can click **Preview new receiving admission**. The server displays the complete group,
current assemblies/packages and processing episodes that will be closed or superseded.

The operator enters a new episode code, receiving custodian/location, actual received
condition, reference and optional observation, then confirms receipt of **all** shown
instruments and the requirement for new cleaning/inspection. Mixed packages/processing
groups are received in full; co-members are not silently freed or put back in stock.

The plan refuses admission while another relevant recall lacks clearance, while
recorded cleaning is running or while a source package has a running sterilization
cycle. The app does not stop equipment. Record the actual completed/aborted outcome
through the existing workflow before admission; do not falsify a result to bypass it.

Scope and source versions are hashed and rechecked at save time. If another case or
custody change invalidates the plan, preview and confirm again. All original case
instruments still needing admission are included, plus complete custody/processing
groups. This increment supports up to 100 instruments in one admission; larger groups
are rejected without a partial transfer and require a later batched workflow.

The transaction:

1. Preserves package, load, release and distribution history and all old package blocks.
2. Closes affected assemblies as disassembled and releases their active assignments.
3. Supersedes non-running held receiving episodes with new immutable versions, preserving
   their attempts and evidence. Running cleaning is never silently superseded.
4. Creates a fresh **Received** episode with zero cleaning/inspection assumed, linked
   to clearance cases, prior episodes, package references and receiving location.
5. Transfers every group member into processing holds and registers case/instrument
   admission links. Those links satisfy only the cleared instrument restrictions.
6. Saves root/child audit entries atomically; child events retain parent-command correlation.

Fresh processing holds prevent assembly until the normal new cleaning and inspection
pass. New packaging uses the new episode's proof. Old release labels and packages
remain blocked permanently in this workflow, even after new packaging is possible.

## Overlapping cases and later incidents

Clearance decisions can be recorded independently, but admission requires all relevant
cases to have clearance. One fresh episode can register matching cleared restrictions
from several cases, preventing duplicate receiving. Each case's current view shows its
linked episodes and still-pending instruments, including admissions initiated from
another case. Older immutable versions do not receive these current projections.

A later recall creates fresh restrictions; it is not covered by an older clearance.
A later admission may supersede a paused episode, retaining its history, but cannot
interrupt running cleaning/cycles. Recorded lineage includes clearance-created episodes
as well as return-created episodes. Historical receiving links remain history if a
later incident supersedes them; use the current receiving/traceability view to follow
subsequent work.

## Boundaries and outstanding work

This is a local fictional-data preview. Evidence references and custodian names are
recorded references, not independent verification of clinical suitability or signed
physical custody. Real identity/competency and approved local clearance procedures
require operational validation. RSP-ISS-001 independent inspection remains parked.

No old package is restocked, no notification or equipment control is performed, and
no cross-facility propagation, arbitrary unblock, quarantine/discard correction,
partial-instrument clearance or batches above 100 instruments are implemented.
See RSP-ISS-005 and TESTING-REGISTER.md for deferred manual/production acceptance.

## Owner result update — November 5, 2026

U-CLEAR-01 reviewer clearance and U-CLEAR-02 operator receiving admission both passed
from owner screenshots. After admission, zero instruments await receiving, a linked
episode is shown and the admission button is absent to prevent duplicates. Continue
in Receiving and cleaning; broader manual/clinical acceptance remains deferred.
