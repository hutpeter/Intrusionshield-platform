# Tray definitions and assembly — local preview

November 3, 2026. Standalone Ruby development preview; Athena is optional.
Spanish is the default; English and French are available.

## Update the running Windows preview

Stop the preview in its PowerShell window with **Ctrl+C**, then run:

```powershell
cd "D:\Projects\Latest\CMS\NodeJS\Versions\intrusionshield-platform"
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for `Ready: http://127.0.0.1:9553`, then refresh the browser. This update
adds local SQLite tables without deleting existing instrument records. Keep any
local changes if Git refuses the pull; do not reset or remove the preview data.

## Walkthrough using the existing demonstration instrument

1. Sign in as **Operador demo**. Confirm that `INS-DEMO-001` remains registered
   under `PINZA-DEMO` / `Pinza quirúrgica`. A retired instrument cannot be assigned;
   register a new dummy instrument if you previously retired it.
2. Select **Bandejas → Definiciones → Crear definición**.
3. Enter **Código de definición** `BANDEJA-DEMO-001`, **Nombre de la bandeja**
   `Bandeja de demostración`, select `Pinza quirúrgica`, and set **Cantidad requerida**
   to `1`. Select **Guardar definición**. This defines the required composition.
4. Select **Crear armado**. Enter **Código del armado** `ARMADO-DEMO-001`,
   choose the saved definition if necessary, then **Crear armado**.
5. Review **Requeridos 1 / Asignados 0 / Faltantes 1 / Sobrantes 0**.
   **Completar armado** stays disabled while composition is incomplete.
6. Select **Editar contenido**, choose `INS-DEMO-001`, select **Añadir instrumento**,
   then **Guardar contenido**. The saved assessment should show one assigned
   instrument and no missing or excess instruments.
7. Select **Completar armado**, review the composition, check the confirmation,
   and select **Confirmar acción**. Contents become locked. **Armado completo**
   means composition verified; sterilization and clinical release are separate
   future workflows.
8. Review **Historial de la bandeja**. **Ver versión** opens the contents recorded
   at that version; return using **Volver a la versión actual**.
9. Optional reservation check: create another assembly from the same definition.
   The first assembly's instrument is unavailable for assignment to it. An
   instrument in a draft or complete assembly also cannot be retired.
10. Optional revision check: open the definition, select **Revisar definición**,
    change the required quantity to `2`, enter a reason and **Guardar revisión**.
    Earlier assemblies retain their original revision and quantity. A new
    assembly uses the new requirements.
11. To release assigned instruments, open the original assembly and select
    **Desarmar**. Enter **Motivo del desarmado**, check the confirmation and select
    **Confirmar acción**. Instruments become available for another assembly;
    the original contents and history remain available. A disassembled assembly
    is closed; create a new uniquely coded assembly for the next episode.
12. Refresh, then stop/restart the preview. Saved definitions, revisions, contents
    and history remain. Sign in as **Auditor demo** to review without editing.

Use fresh codes if these demonstration records already exist. Opening another
section with an unsaved form asks whether to discard it.

## Behavior and boundaries

- Definitions and assemblies are scoped to tenant and facility. Operators can
  write; the auditor can only read. Server authorization enforces both.
- Revisions preserve type names/codes and required quantities. Assembly versions
  preserve the actual instrument identities and their recorded type details.
- Missing, excess and unexpected types prevent completion. Retired instruments
  cannot be assigned. One instrument can belong to only one active assembly.
- Concurrent edits require the expected version. Each write records audit,
  version, reservations and retry receipt in one transaction; failures roll back.
- Definitions allow up to 50 types, 500 units per type and 1,000 total units.
  An assembly accepts at most 1,000 individual instrument IDs. Selection options
  currently load up to 1,000 records; a larger production catalogue needs search.
- The development SQLite adapter adds tray definitions, immutable definition
  revisions, assemblies, immutable assembly versions and scoped reservations.
  Existing instrument rows are preserved. SQL Server migrations are not run.
- This increment covers composition and history. It does not implement washing,
  packaging, sterilizer cycles, release, patient linkage, recall or equipment
  control. It is a dummy-data preview, not a clinically validated deployment.

See [LOCAL-PREVIEW.md](LOCAL-PREVIEW.md) for startup, data location, security and
production integration limitations.

## Verification for this increment

53 automated checks passed: 20 domain, 23 service/SQLite/HTTP, six web API and
four launcher dispatch checks. Scoped package builds also passed. Tests exercise
scope/role denial, stale versions, duplicate reservations, missing/excess counts,
immutable revisions, audit rollback, and reopening/upgrading preview storage.
Headless Chromium completed the Spanish create/assign/confirm/history/disassemble
workflow, locked completed contents, mobile overflow check and EN/FR screens.
The owner's earlier Windows instrument registration and persistence checks were
reported successful; this tray increment still needs that Windows walkthrough.

## Scan-assisted draft additions

[TRAY-SCANNING.md](TRAY-SCANNING.md) adds a separate confirmed one-instrument scan
action with current type/quantity/hold/assignment gates and atomic reservation/history.
Manual contents editing and separate assembly-completion confirmation remain available.
