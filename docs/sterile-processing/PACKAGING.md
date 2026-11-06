# Packaging and preparation labels

November 4, 2026. Standalone development preview, Spanish default with EN/FR.
See [TESTING-REGISTER.md](TESTING-REGISTER.md) for passed and deferred checks.

## Update and one short owner check — U-PACK-01

Stop the running preview with **Ctrl+C** in PowerShell, then run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for **Ready: http://127.0.0.1:9553**, leave PowerShell running and refresh.

1. As **Operador demo**, select **Empaque y etiquetas → Preparar ejemplo ficticio
   de empaque**. This creates separate fictional records with simulated cleaning,
   inspection and tray assembly. Existing instruments and trays are preserved.
2. The form opens with dummy packaging values already filled in. Check the
   closure, contents/identification and final confirmation boxes, then
   **Guardar empaque**. These confirmations are part of the fictional walkthrough.
3. Select **Ver etiqueta**. Expected: a saved package label with its unique code,
   tray, material lot, packing date and **NO ESTÉRIL · NO LIBERADO**.

That is the only manual check requested for this build. No physical printing,
voiding, older-module walkthrough or end-to-end regression is requested now.

**Workflow update:** manual load/cycle records now exist. Packages assigned to a
retained load cannot be voided, and a satisfactory cycle leaves them unreleased.
See [LOADS-CYCLES.md](LOADS-CYCLES.md). The packaging smoke check is already
owner-confirmed; it does not need repeating for this build.

## Implemented behavior

A package records a completed assembly and its exact version, an immutable copy of
that assembly, material/lot and procedure/version, closure/content confirmations,
operator and server time. Every instrument must still belong to that assembly,
remain registered at the saved instrument version, have no processing hold, and
have passed the latest received episode's inspection before assembly completion.
The package stores individual inspection proof plus the exact source episode and
version, inspection number, cleaning attempt, evidence and actor. It does not
silently attach an older successful inspection from before a newer receipt.

The original composition-only demonstration tray can still be read, but cannot
be packaged without the inspection prerequisites. The fictional example provides
a ready assembly without changing that earlier demonstration tray.

One active package is allowed per assembly. The package locks disassembly while
active. Explicit **Anular paquete**, a reason and confirmation preserve all
history and release only the packaging lock. Instrument reservations in the
completed assembly remain until a separate explicit disassembly. A voided code
cannot be reused. Historical package versions are read-only and cannot be printed
through the application's label button.

Voiding requires acknowledgement that earlier physical labels will be removed.
The preview cannot revoke a printed piece of paper or determine whether a damaged
or opened package needs reprocessing. Do not interpret a clerical void/repack as
a clinical disposition; those policies remain part of the full workflow design.
Cycle/load association now prevents voiding while the package remains assigned. Authorized disposition and reprocessing remain deferred.

## Label and print boundaries

The current output is a **human-readable internal preparation label**, not a
sterile-release label. It includes a scoped package code, globally unique internal
identifier (`RSP-PACK-1:<UUID>`), tray, count, facility, packaging material lot,
procedure and packing attribution/time. It does not create an expiry date, UDI,
GS1 identifier, barcode or QR symbol. Machine-readable symbology and label-device
contracts remain future integration work.

**Imprimir etiqueta** first reloads current package state/version. If it was voided
or changed since the label opened, the app removes the label and refuses that
print action. Otherwise it opens the browser print dialog. Printing does not
create a verified physical-print event; cancellation, printer delivery, media,
size, durability and scan readability still require hardware validation.
The print stylesheet isolates the label from the surrounding workflow screen.
Existing paper copies always require a check against current system status.

## Authorization, persistence and limitations

- Separate server permissions: `packaging:read` / `packaging:write`. Preview
  auditors can read records, proof and history but cannot pack, void or create
  fictional prerequisites. The UI exposes printing to the operator fixture.
- Existing identity/session/CSRF/host/origin guards remain in place. The independent
  inspector role and no-self-inspection rule remain explicitly deferred in
  [RSP-ISS-001](ISSUES.md#rsp-iss-001--independent-inspector-role-and-no-self-inspection).
- Packaging writes, immutable versions, reservations, retry receipts and audit
  commit together. Stale versions and competing active-package requests conflict.
- Additive development SQLite tables: `sp_packages`, `sp_package_versions`,
  `sp_package_assignments`. No SQL Server connection or migration is performed.
  Package lists return summaries rather than repeating full evidence snapshots.
- Materials, lots and procedure versions are recorded text references. Approval,
  shelf life, material compatibility, sterile-barrier validation, cycle profile,
  expiry, release, distribution and recall are not certified or implemented by
  this stage. No equipment is contacted or controlled.
- Packaging now captures the inspection-to-assembly link. Bare legacy assembly
  records do not gain retrospective proof. Production workflow policy for all
  old/new instruments remains part of the end-to-end acceptance review.

## Traceability and deferred review

This increment partially advances the roadmap's assembly/packaging/label stage.
The testing register tracks the manual void/repack and inspection-proof review,
physical printer/scan validation, and connected cycle/release workflow separately.
The label is deliberately a preparation record until those later stages exist.

## Package Data Matrix and draft-load scanning

See [PACKAGE-LOAD-SCANNING.md](PACKAGE-LOAD-SCANNING.md) for version-bound internal
package labels, confirmed one-package draft additions and the one fictional owner check.
