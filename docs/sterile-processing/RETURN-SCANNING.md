# Scan-assisted complete-package returns

## Update and one owner check

Stop the preview with Ctrl+C, then run in the platform repository:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

After **Ready**, refresh. **U-RETSCAN-01 passed November 6, 2026 (owner screenshot); original check:**

1. Enter as **Demo operator** → **Returns and reprocessing**.
2. In **Scan issued package for return**, click **Prepare fictional return scan example**.
3. Click **Simulate return scan**. The original issued package and contents open in
   **Record return**, with fictional condition/location/reference prefilled.
4. Review the manifest, then tick **I confirm all instruments in this package have been
   received** and **I confirm this return; the package will remain unavailable**.
5. Click **Save return**.

Expected: **Returned — awaiting disposition**, original issue traceability, and
**Internal identifier and returned contents recorded**. This is the only requested owner
check; do not add disposition/reprocessing or discrepancy tests for this build.

Spanish: **Devoluciones y reprocesamiento** → **Escanear paquete entregado para devolución**
→ **Preparar ejemplo ficticio de escaneo de devolución** → **Simular escaneo de devolución**
→ both confirmations → **Guardar devolución**. Expected **Devuelto — disposición pendiente**.

The setup simulates the prerequisite cycle/review/storage/issue using separate operator
and reviewer attribution. It does not record a return automatically. The older fictional
return-example helper is a different entry point; use the scan-example button above.
No physical equipment, cleaning, handover, recovery or clinical release is performed.

## Issued-package lookup

On the returns list, focus **Return package scan identifier**, enter/scan a complete
version-bound internal RSP-P token and press Enter or **Find issued package**. The
simulation uses the same actual token and read-only endpoint as a keyboard scanner.
The scanner accepts only the internal format, not manufacturer UDI/GS1, URLs, partial
identifiers or instrument RSP-I tokens.

The service retrieves the current package and the original issued distribution record
inside the authenticated tenant/facility. It rejects stale/voided packages, packages
without an issued source, duplicate returns and unknown/foreign records. The response
includes the original issue and frozen package contents needed for reconciliation;
it does not expose cleaning or inspection proofs. Lookup itself records no return.

A recalled issued package may be received back: the form displays the recall warning,
the recall block remains, and recording return does not authorize reprocessing or reuse.
The existing disposition gates remain authoritative. Refusing physical return simply
because a recall exists would obstruct recovery; this workflow preserves both records.

## Contents and return confirmation

The scanned form fixes its source issue to the lookup result and shows original instrument
codes, types and serial numbers. Review the actual returned contents before confirming
complete receipt. Condition, receiving/quarantine location, returning custodian, reference
and optional observation remain operator-recorded fields.

If contents are missing or mismatched, select **Contents are missing or do not match the
original package**. A visible discrepancy message disables complete-contents confirmation
and Save. Unflag only after reconciliation. This is a **pre-save discrepancy stop**;
it does not persist a partial return, shortage incident, new quarantine event or later
recovery record. Follow the institution's existing discrepancy procedure. Persistent
partial/mismatched return reconciliation is logged separately under RSP-ISS-008.

The scanned save requires explicit complete-contents and return confirmations, current
issue version, exact package token and the exact set of original instrument IDs. Missing,
extra, duplicate or mismatched IDs are rejected with RETURN_CONTENTS_MISMATCH. No partial
return or partial gate rows are saved. The normal manual complete-return path retains
its established contract.

Successful save freezes the internal identifier and declared received contents, original
issue snapshot, condition/location/reference, receiving actor and time. Earlier issue,
load and release history remains unchanged. The returned package stays unavailable,
including unopened returns, until the existing separate reviewer disposition/reprocessing
workflow is completed. A return never silently restocks a package or revives its labels.
Retry receipts prevent duplicate mutation; competing returns and late audit errors
cannot create a second or partial record. Traceability includes the recorded identifier.

The identifier/manifest snapshot records an operator declaration from a typed or simulated
lookup, not verified physical scanner evidence or independent inspection. RSP-ISS-001
cleaner/inspector separation remains parked.

## Verification and deferred work

**Developer verification November 6, 2026:** 284 scoped automated tests (152 domain,
103 service/SQLite/HTTP, 29 web API/export/symbol), scoped builds and targeted browser
verification. Coverage includes issued-source lookup without mutation, original handover/
manifest retention, exact contents matching, duplicate/stale/foreign/not-issued rejection,
recall-preserving return, reprocessing block, role/CSRF/strict inputs, retries, competing
returns, persistence and late audit rollback. Browser verification passed: discrepancy stop, both confirmations, saved pending
disposition, frozen source/manifest, duplicate gate, package hold and refresh persistence.

U-RETSCAN-01 passed November 6, 2026 based on the owner screenshot. Deferred M-RETSCAN-01: owner discrepancy/exception/history/
recall and disposition/reprocessing walkthroughs; M-RETSCAN-02: physical scanner/focus,
Windows, ES/FR/mobile and large manifests; M-RETSCAN-03: persistent partial/mismatched
returns, physical recovery, recipient acknowledgement, production identity/policy and
full operational acceptance. RSP-ISS-007 retains hardware/DPM/UDI/GS1/camera backlog.
