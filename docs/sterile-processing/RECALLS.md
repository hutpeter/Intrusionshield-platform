# Withdrawal and recall — local preview

A reviewer can withdraw one package or a whole load. The case captures package
versions and the documented storage location or issued destination/recipient.
Original release decisions and movement history remain unchanged. Current recall
blocks prevent further storage, transfer, issue, loading/start, release approval,
package void and normal label-print authorization. Previously printed paper cannot
be revoked by software; staff must follow an approved operational recall procedure.

## Update and run

Stop the preview with Ctrl+C in its PowerShell window, then run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Keep that window running. Once Ready appears, refresh http://127.0.0.1:9553.
Existing fictional records are preserved.

## One owner check — U-RECALL-01

1. Sign out and enter as **Demo reviewer / Revisor demo**.
2. Open **Withdrawal and recall / Retiradas y recuperación**.
3. Click **Prepare fictional recall example / Preparar ejemplo ficticio de retirada**.
4. Keep the prefilled values and check the recall confirmation.
5. Click **Save recall / Guardar retirada**.

Expected: **Recall open — issue blocked / Retirada abierta — entrega bloqueada**
and the original storage location **DEMO-STORE-A**. The helper creates a separate
fictional released/stored package; the recall itself requires your confirmation.
This is the only requested owner check for this build.

## Subsequent workflow

- Demo reviewer creates cases and records disposition.
- Demo operator records recovery, including quarantine location and reference.
- Demo auditor reads cases and historical versions.

Each item must be recovered before disposition: keep quarantined, reprocessing
required or discard recorded. These are documented actions, not physical operations.
The case closes after every item has a disposition. Closing never restores stock
availability or validates old labels. Overlapping cases retain independent history;
all blocks persist. Recovery locations belong to the case; original issue/storage
records remain historical custody evidence rather than live physical tracking.

Versions, confirmation, scoped permissions and audit apply to each action. No
notifications are sent. Actual reprocessing, return-to-stock, rescission, disposal
execution, production identity and operational recall validation remain future work.
Independent cleaner/inspector separation remains parked as RSP-ISS-001.

## Recall lineage update — November 5, 2026

See [RECALL-LINEAGE.md](RECALL-LINEAGE.md) for impact preview, descendant/current-custody
package blocks, persistent instrument blocks and explicit extension of older cases.
New cases use this policy; existing saved cases are not silently migrated.
