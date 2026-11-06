# Returns and reprocessing — local preview

This increment records complete-package returns after issue. It preserves the
original package, cycle, final review and issue snapshots. A return never resets
the old issue to stored or makes an old package available again.

## Update and run

In the running preview PowerShell window, press Ctrl+C, then run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for Ready, leave PowerShell running and refresh http://127.0.0.1:9553.
Existing fictional records are retained. No production database is involved.

## One owner check — U-RETURN-01

1. Enter as **Demo operator / Operador demo**. If currently signed in as the
   reviewer, sign out and switch roles first.
2. Open **Returns and reprocessing / Devoluciones y reprocesamiento**.
3. Click **Prepare fictional return example / Preparar ejemplo ficticio de devolución**.
4. Keep the prefilled values. Confirm both receipt of all instruments and the
   return itself.
5. Click **Save return / Guardar devolución**.

Expected: **Returned — awaiting disposition / Devuelto — disposición pendiente**,
location **DEMO-RETURN-QUARANTINE**, and **Original issue (historical)** showing the
previous destination/recipient. The helper simulates a separate issued package;
the return itself requires your explicit confirmation. This is the only requested
owner check for this build.

## Implemented workflow

| Actor         | Action                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo operator | Record a return for a currently issued package, classify unopened/opened/used/damaged, record receiving location, custodian, reference and optional observation |
| Demo reviewer | Record quarantine, or authorize a new receiving/cleaning episode with a unique episode code and reason/reference                                                |
| Demo auditor  | Read records, original issue snapshots, immutable versions and history                                                                                          |

All instruments in the package must be confirmed received. Duplicate package
returns, stale versions, spoofed scope/actor fields and unauthorized mutations are
rejected. Partial/missing-content handling remains deferred; do not confirm complete
contents for an incomplete return. No patient details are collected by this flow.

A return immediately blocks normal old-package printing, loading/start, void and
release approval, as well as distribution eligibility. Current screens show the
return overlay; historical snapshots preserve original facts. Print preflight
reloads current status. Software cannot revoke already printed paper.

Quarantine retains existing instrument/tray/package reservations and has no
restock or clearance shortcut. Reprocessing requires a complete, unchanged active
assembly with registered instruments and no processing holds. Damaged packages or
packages with recall blocks cannot use this shortcut. Their repair, recall
clearance and authorized release from quarantine require later policies.

Reviewer authorization atomically:

1. Records disposition and the link to a new receiving episode.
2. Closes the old assembly as disassembled, with a new immutable version and audit.
3. Releases its package/assembly reservations and transfers its instruments into
   processing holds on the new episode.

The old package/load/review/issue remain historical and permanently unavailable.
The new episode starts at **Received**, with no cleaning or inspection assumed.
Find its displayed code under **Receiving and cleaning** and continue the existing
workflow. Only new cleaning/inspection evidence allows a new assembly and package.
Child assembly/receipt audit entries have distinct request IDs and retain the
parent disposition command as `correlationRequestId`; all commit or roll back together.

## Limits and deferred work

This is a fictional local preview. The role fixtures are not production identity
or competency certification. Independent cleaner/inspector separation remains
parked as RSP-ISS-001. Recording disposition does not physically clean, dispose of,
repair or locate instruments. No notifications are sent.

Partial returns, missing instruments, direct unopened restock, damaged-instrument
repair, quarantine clearance, corrected dispositions, use/procedure recording,
production policies and cross-facility recall handling remain deferred.
See RSP-ISS-003 and RSP-ISS-004. New or explicitly extended recalls now traverse
recorded reprocessing lineage and block the original instruments' current custody;
older cases require explicit reviewer extension. See RECALL-LINEAGE.md.
Full manual/end-to-end testing remains pending in TESTING-REGISTER.md.

## Scan-assisted complete returns

See [RETURN-SCANNING.md](RETURN-SCANNING.md) for issued-package lookup, original-content
reconciliation, explicit complete-return confirmation and the one fictional owner check.
