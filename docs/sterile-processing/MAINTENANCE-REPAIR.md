# Instrument maintenance and repair — local preview

## Update and one owner check

Stop the preview with Ctrl+C, then in the platform repository run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

After **Ready**, refresh the browser. **U-MAINT-01 remains pending:**

1. Enter as **Demo operator** and open **Instruments**.
2. Click **Prepare fictional maintenance instrument**. It creates a separate fictional
   instrument, outside active trays and processing, and opens its details.
3. In **Maintenance and repair**, click **Report defect and hold**.
4. Keep the fictional values, tick **I confirm this record**, and click
   **Save maintenance record**.

Expected: **Maintenance hold — unavailable** and the recorded defect/location.
This is the only requested owner check for this build. Assessment, repair and reviewer
return are verified separately by developer tests; owner walkthroughs are deferred.

Spanish equivalents: **Instrumentos**, **Preparar instrumento ficticio de mantenimiento**,
**Registrar defecto y retener**, **Confirmo este registro**, **Guardar registro de mantenimiento**.

## Delivered workflow

The instrument record retains an ordered maintenance history with defect, quarantine
location, timestamps and reporting actor. A maintenance hold changes the instrument's
state to `maintenance`. It is unavailable to ordinary receiving and tray assembly;
packaging also checks current instrument state/version. Retirement cannot silently
bypass the maintenance workflow.

This increment accepts only instruments **outside active trays and processing episodes**.
A current assembly assignment, processing hold or unresolved recall restriction blocks
maintenance transitions. Active/package custody must first be reconciled using the
existing return, recall, disposition and disassembly workflows. Do not record fictitious
recovery or processing outcomes to obtain eligibility. Recording a defect directly
against a loaded, issued or actively processing instrument needs the future incident
and custody workflow in RSP-ISS-006.

1. **Demo operator reports defect:** defect/reason, quarantine location and confirmation.
2. **Demo operator records assessment:** assessment details and evidence reference.
3. **Demo operator records repair:** work details, service provider and evidence reference.
   This records a service report; it does not perform or certify physical repair.
4. **Demo reviewer authorizes fresh processing:** reviewed functional verification,
   rationale/evidence, reprocessing procedure/version, new receiving code, custodian and
   receiving location, with explicit confirmation. Dedicated `maintenance:authorize`
   permission is required; operator/auditor cannot authorize and reviewer cannot record
   the operator's assessment or repair stages in this preview.
5. The same transaction records authorization, changes the instrument back to its
   registered lifecycle state and creates a fresh **Received** episode with a processing
   hold, zero cleaning attempts and zero inspections. Registered does **not** mean
   clinically available. The new processing hold prevents assembly until fresh cleaning
   and inspection succeed. Continue as Demo operator in **Receiving and cleaning**.

Every stage checks current instrument version and required prior stages. Evidence is
append-only within each maintenance record; a saved assessment/repair/authorization
cannot be overwritten. Retry IDs replay the original result; changed/stale requests
are rejected. Holds, episode creation, audit and receipts commit or roll back together.
The preview allows up to 100 maintenance records per instrument, rejecting further
reports without truncation; scalable history archival is future work.

A new recall recorded during maintenance also blocks return authorization; concurrent
maintenance/recall custody reconciliation needs the future incident workflow and
remains held rather than silently bypassing either restriction.

Existing recalls remain independent restrictions. Maintenance authorization cannot
remove recall blocks, restore old packages or validate old labels. Its new receiving
source identifies the instrument, maintenance record and approved reprocessing
procedure/version. Traceability includes the current maintenance hold, stage facts,
actor/timestamps and receiving links. The instrument detail retains complete evidence.

## Validation and limits

Developer verification: 234 scoped automated tests (121 domain, 92 service/SQLite/HTTP,
21 web API/export), scoped builds, plus a Chromium walkthrough of operator report,
assessment, repair, reviewer authorization, fresh receiving hold and browser refresh.
No inherited cleaning/inspection is accepted. Domain tests continue the new episode
through new cleaning/inspection and tray assignment. SQLite tests verify reopening
and rollback after a late audit failure.

Owner U-MAINT-01 and broader Windows/ES/FR/mobile, physical service/functional evidence,
production identity/competency, active-custody defect reporting, corrections, failed or
unrepairable items, vendor integrations, costs/scheduling and preventive/predictive
maintenance acceptance remain pending. No actual equipment, repair, clinical release,
production database or patient data is used. RSP-ISS-001 independent inspection remains
parked; this build does not implement that separate role policy.
