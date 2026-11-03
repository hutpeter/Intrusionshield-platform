# Receiving used instruments and recording cleaning

**Workflow update:** inspection is now available; see [INSPECTION.md](INSPECTION.md).
The long walkthrough below is retained for the deferred end-to-end review. Only
the single check in [TESTING-REGISTER.md](TESTING-REGISTER.md) is currently requested.

November 3, 2026. Development preview, Spanish first with English and French.
This is a standalone Ruby workflow; Athena is not required.

## Update and restart on Windows

In the existing preview's PowerShell window, press **Ctrl+C**, then:

```powershell
cd "D:\Projects\Latest\CMS\NodeJS\Versions\intrusionshield-platform"
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for `Ready: http://127.0.0.1:9553`. Leave PowerShell running and refresh the
browser. If the command returns to the prompt, inspect its error before reloading.
Existing instrument and tray data are preserved; new tables are additive.

## Spanish walkthrough — keep the completed tray intact

1. Enter as **Operador demo**. Keep `ARMADO-DEMO-001` intact. Its instrument
   `INS-DEMO-001` remains reserved to it and cannot be received again while assigned.
2. Select **Instrumentos → Registrar instrumento**. Register a new dummy instrument:
   code `INS-DEMO-002`, type `Pinza quirúrgica`, serial `002`. Save it.
3. Select **Recepción y limpieza → Registrar recepción**.
4. Fill in **Código de recepción** `REC-DEMO-001`, **Procedencia**
   `Quirófano de demostración`, **Responsable de entrega** `Personal demo`,
   **Condición al recibir** `Usado — prueba ficticia`. Leave discrepancies empty
   unless you want to document a dummy discrepancy.
5. Under **Instrumento**, select `INS-DEMO-002` and click **Añadir instrumento**.
   Check the receipt confirmation, then **Guardar recepción**.
6. Check the status **Recibido** and saved instrument list. The instrument is now
   held for processing and cannot be assigned to a tray or retired.
7. Click **Iniciar limpieza**. Select **Manual**, enter **Referencia del
   procedimiento** `SOP-DEMO`, **Versión del procedimiento** `1`. These are dummy
   references, not an approved hospital procedure. Confirm the start and click
   **Iniciar limpieza** inside the form.
8. Click **Registrar resultado**. Select **Limpieza fallida**, enter
   **Referencia de evidencia** `EVID-DEMO-FAIL-001` and **Observación / motivo del
   fallo** `Residuo ficticio observado`. Check the result confirmation and select
   **Guardar resultado**. Status becomes **Limpieza fallida — retenido**.
9. Click **Nuevo intento de limpieza**. For a mechanical demonstration, select
   **Mecánico**, procedure `SOP-MEC-DEMO`, version `1`, equipment reference
   `LAVADORA-DEMO-001`. Confirm and start. This records a manual equipment reference;
   it does not contact or control a washer.
10. Click **Registrar resultado**, choose **Limpieza satisfactoria**, evidence
    `EVID-DEMO-PASS-002`, optionally enter an observation, confirm and save.
11. Confirm **Pendiente de inspección — retenido**. Both cleaning attempts remain
    visible with the original failure evidence, procedure references, operator and
    server-recorded start/finish times. Successful cleaning does not release the hold.
12. In **Historial del procesamiento**, open **Ver versión 1**: receipt with no
    cleaning attempts. Version 3 preserves the failed first attempt; version 5
    includes the successful second attempt. Return to the current version.
13. Refresh the browser. The preview opens **Instrumentos**; select **Recepción y
    limpieza → Ver detalle** on `REC-DEMO-001` to reopen the saved episode.
14. Optionally stop/restart the preview and reopen the same record. Select
    **Auditor demo** to verify read-only access to the episode and its versions.

Use new unique codes if these records already exist. Do not recreate records
merely because browser refresh returns to the instrument list.

## Workflow and limits

`received → cleaning → cleaning_failed → cleaning → awaiting_inspection`

The failed branch is optional; a passed first attempt moves directly from cleaning
to awaiting inspection. Each episode has an immutable received-instrument snapshot
and version history. Required receipt fields are source, handover custodian,
condition, one or more instrument IDs, and explicit receipt confirmation.
Discrepancies are recorded as free text. Counts are derived from the actual selected
instrument IDs; expected delivery counts and pack discrepancies are future work.

Each start needs a procedure reference/version, method, operator confirmation and
an equipment reference for mechanical cleaning. Each result needs pass/fail,
evidence reference, and confirmation; a failed result also needs a reason. Evidence
is a text reference, not a file upload or automatically verified device reading.
This increment records cleaning only, not high-level disinfection.

Receipts are limited to 100 individually registered instruments. A maximum of 50
attempts per episode keeps snapshots and response sizes bounded. A cleaning attempt
applies to the entire received group; use separate episodes if instruments need
different methods or outcomes. Records cannot currently be edited, cancelled or
split after receipt. Inspection is now available in the next increment; corrections and authorized disposition remain later work. Never use this preview to authorize clinical work.

Draft/complete tray membership prevents receipt; a tray must be explicitly
and appropriately disassembled before its instruments can enter a new receipt.
A processing hold prevents duplicate receipt, tray assignment and retirement.
The hold deliberately remains after a passed result, pending the inspection
workflow. New instrument registration still supports the existing composition-only
tray demo; this increment does not enforce a validated end-to-end processing route
for legacy or never-received records, nor create a sterile-availability state.

## Technical and requirements notes

- All episode, version, history, hold and instrument queries are tenant/facility
  scoped. `processing:read` and `processing:write` are separate permissions.
  Preview auditors receive reads only; production adapters must provide grants.
- Opaque loopback preview sessions, CSRF and host/origin controls remain in place.
  Client-supplied tenant/actor fields and unknown request fields are rejected.
- Versions prevent stale writes. Idempotency keys allow safe retries of identical
  commands. Episode, snapshot, hold, audit and receipt writes commit atomically.
- Additive preview SQLite tables: `sp_processing`, `sp_processing_versions`,
  `sp_processing_holds`. SQL Server is neither connected nor migrated. SQLite
  lock acquisition now yields while another connection commits, with a bounded
  three-second wait rather than blocking the Node event loop.
- RSP-007 (receipt): partial preview implementation; attributed receipt and
  discrepancies with new episode. Pack handling and prior sterile-availability
  invalidation await those underlying product features.
- RSP-008 (cleaning/disinfection): partial preview implementation; cleaning
  methods, attributed attempts and evidence. Procedure approval/version governance,
  device evidence and HLD are not implemented.
- AT-006/007: partial development coverage. Holds and evidence gates are tested;
  inspection is now present in the next preview increment; packaging, sterile-release and production validation remain future work.

No standard certification, tender acceptance, clinical validation, production
identity integration or production licensing verification is claimed by this preview.

## Verification of this increment

69 scoped automated checks passed: 28 domain, 30 service/SQLite/HTTP, seven web API
and four launcher checks. Package builds passed. Coverage includes cross-scope
reads/writes, read-only roles, explicit confirmations, required evidence, illegal
transitions, failed-attempt retention, idempotency, stale versions, duplicate
reservations and audit-failure rollback (including result recording).

Headless Chromium completed the Spanish receipt → manual cleaning → failed result
→ mechanical retry → passed result workflow. It checked unsaved-form protection,
historical versions, browser refresh, English/French labels, mobile overflow,
auditor access and session-loss clearing. A full launcher stop/start retained the
episode, both attempts, failed historical version and instrument hold. Windows
validation of this new workflow remains the owner's next step.
