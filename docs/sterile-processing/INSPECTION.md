# Inspection after cleaning

November 3, 2026. Standalone fictional-data preview. See the
[testing register](TESTING-REGISTER.md) for completed, pending and deferred checks.

## Update and one short check

Stop the preview with **Ctrl+C** in PowerShell, then:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for **Ready: http://127.0.0.1:9553**, leave PowerShell running, and refresh.

1. As **Operador demo**, select **Recepción y limpieza**.
2. Select **Preparar ejemplo ficticio de inspección**. It creates a new fictional
   instrument, receipt and simulated cleaning, already pending inspection. Existing
   instruments and trays remain unchanged; this is not actual cleaning evidence.
3. Select **Registrar inspección**. Enter procedure `INSPECT-DEMO`, version `1`,
   evidence `EVID-INSP-DEMO`. Set **Limpio**, **Seco**, **Íntegro** and **Funcional**
   to **Conforme**, check the confirmation, and save.
4. Expected: **Inspección satisfactoria — disponible para armado**.

This is the only requested manual check for this build. The longer walkthroughs
and regression checks are tracked as deferred, rather than requiring you to repeat
receipt and cleaning each time.

## Implemented behavior

- A recorded successful cleaning is required before inspection. Each instrument
  needs four explicit results. The server derives the overall pass/fail; it does
  not trust a caller-supplied overall result. Missing/duplicate/foreign items,
  omitted results, absent evidence and unconfirmed submissions are rejected.
- Every failed instrument needs a defect/observation note. Any failure holds the
  whole group. A new cleaning attempt and subsequent inspection can be recorded;
  the first inspection and its defect evidence remain unchanged. Damage correction
  or maintenance is not performed by re-cleaning and is outside this increment.
- An all-pass inspection releases that episode's holds atomically with its audit,
  version and retry receipt. Instruments may then be assigned to a tray. Old
  versions remain readable; later duplicate commands cannot release newer holds.
- Each inspection records actor, server time, procedure/version, evidence,
  individual checks, result and the cleaning attempt inspected. Previously saved
  episodes without inspections remain readable. No schema reset is required.
- Existing processing write authorization governs inspection in this preview;
  a separate competent-inspector role requires production authorization design.
  Read-only auditors cannot record inspections or prepare fictional examples.
- Fictional preparation is available only in the explicitly opted-in development
  preview. It requires the operator fixture, same-origin session and CSRF token.
  All setup writes are one transaction and retries use the same request key.

No clinical release, packaging, cycle validation, maintenance disposition or
production procedure approval is implemented by this inspection stage.
