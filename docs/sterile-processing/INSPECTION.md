# Inspection after cleaning

Updated November 13, 2026 for independent inspection. Standalone fictional-data preview. See the
[testing register](TESTING-REGISTER.md) for completed, pending and deferred checks.

## Update and one short check

Stop the preview with **Ctrl+C** in PowerShell, then:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for **Ready: http://127.0.0.1:9553**, leave PowerShell running, and refresh.

1. As **Demo operator**, open **Receiving and cleaning**.
2. Click **Prepare fictional inspection example**. It creates one new fictional
   receipt and simulated cleaning, preserving existing records.
3. Confirm the independent-person guidance appears and **Record inspection** is
   unavailable to this operator. That is the only owner check for this build.

An authorized independent person performs inspection. In the dummy preview,
**Demo reviewer** has the separate inspection permission without cleaning rights:
open the new receipt's detail and record the four checks, procedure/version,
evidence and confirmation. The developer browser walkthrough verified this
handoff; it is not an additional owner check now. Real-account users need
`processing:read`, `processing:inspect`, applicable source read permissions and an
approved canonical person mapping. See [INDEPENDENT-INSPECTION.md](INDEPENDENT-INSPECTION.md).

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
- Inspection requires `processing:inspect`, separate from `processing:write`.
  Everyone who started or finished cleaning in the episode is disqualified, even
  through an alias account or after retries. Auditors cannot record inspections.
  Historical identity gaps stay held instead of receiving inferred approval.
- Fictional preparation is available only in the explicitly opted-in development
  preview. It requires the operator fixture, same-origin session and CSRF token.
  All setup writes are one transaction and retries use the same request key.

No clinical release, packaging, cycle validation, maintenance disposition or
production procedure approval is implemented by this inspection stage.
