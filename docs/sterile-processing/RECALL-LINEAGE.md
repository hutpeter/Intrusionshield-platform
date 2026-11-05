# Recalls through reprocessing history — local preview

Updated November 5, 2026. New recalls can include the original package/load targets,
packages reached through recorded return/reprocessing links and the current package
custody of the affected instruments. Original release, issue and return facts remain.

## Update and run

Press Ctrl+C in the preview PowerShell window, then run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for Ready, keep PowerShell running, then refresh http://127.0.0.1:9553.

## One owner check — U-LINEAGE-01

1. Sign out and enter as **Demo reviewer / Revisor demo**.
2. Open **Withdrawal and recall / Retiradas y recuperación**.
3. Click **Prepare fictional reprocessing recall example / Preparar ejemplo ficticio de retirada tras reprocesamiento**.
4. Review the prefilled **Recall impact: 2**: an original target and a linked
   reprocessed package. Keep the prefilled reason/reference and check the confirmation.
5. Click **Save recall / Guardar retirada**.

Expected: **Recall open — issue blocked**, two affected packages, **Original target**
and **Linked reprocessed package**, one blocked instrument and the descendant's
recorded **DEMO-DESCENDANT-STORE** location. The original package also shows its
recorded return; its earlier issue/storage reference is explicitly historical.

The setup helper simulates the prerequisite issue, return, new cleaning/inspection,
assembly, packaging, cycle/release and storage using separate operator/reviewer
fixture transactions. No actual inspection or machine cycle occurs. You explicitly
review and save the recall. This is the only requested owner check for this build.

## Impact and confirmation

For normal entry, select a package or load and click **Preview affected history**
before confirming. The preview identifies:

- **Original target:** the saved source package or packages in the source load version.
- **Linked reprocessed package:** a package linked through an authorized return,
  its new receiving episode and that episode's saved inspection proof. Traversal
  follows successive recorded generations.
- **Current instrument custody:** a presently assigned package containing an affected
  original instrument, including a later manual episode without an explicit return link.

Only original source instruments receive persistent instrument blocks. A co-loaded
peer's separate lifecycle is not expanded merely because it shared equipment.
A mixed package containing an affected instrument is held as a whole; its other
instruments are not silently released or treated as newly contaminated descendants.
Broader contamination/repair/separation rules require approved operational policy.

The server recomputes scope when saving and checks the preview hash. Changed
membership, instrument versions, return history or recorded custody can invalidate
confirmation. Preview again and reconfirm; no partial case is committed. Older API
requests without a preview hash are accepted only when no additional packages are
found. Unknown scope/actor body fields remain rejected.

Original issue/storage references are recorded custody history, not physical tracking.
For an already returned/reprocessed ancestor, the return reference is shown alongside
its historical custody snapshot. Case items still require explicit reconciliation;
no physical recovery, destruction or clinical clearance is inferred automatically.

## Persistent blocks

A new recall atomically saves package blocks, original-instrument blocks, scope,
history and audit. Existing package interlocks deny storage, transfer/issue, loading,
release approval, void and normal label printing. Instrument blocks also deny:

- New assembly assignment/completion using an affected instrument.
- New packaging using an affected instrument, including an assembly already completed.
- Successful inspection that would otherwise clear a processing hold.
- Return disposition's reprocessing shortcut for affected instruments.

Cleaning observations and failed-inspection evidence can still be recorded. A passed
inspection recorded before the recall remains historical evidence; it cannot bypass
the current block. Current instrument/processing screens and traceability show the
recall block. Closing a case retains both package and instrument blocks. There is
now a separate authorized clearance and new receiving workflow; see RECALL-CLEARANCE.md. Already printed paper cannot
be revoked; staff must reconcile labels and physical custody under their procedure.

## Explicit extension of older cases

Existing saved cases are not silently migrated or rewritten. To apply this policy:

1. Open the case as Demo reviewer and click **Extend recall**.
2. Click **Preview affected history** and review the targets.
3. Enter an extension reason/reference, confirm and save.

The new version preserves existing item snapshots, recovery and disposition records;
new targets start outstanding. A closed case reopens if new outstanding targets are
added. An older case with no descendants can still be explicitly upgraded to persistent
instrument blocking. A case already covered with no new targets cannot be extended
as a no-op. Concurrent changes/stale versions are rejected, and retry receipts are
idempotent. Original versions remain available. Operator/auditor cannot extend cases.

## Limits and outstanding work

All reads, blocks and mutations remain within the authenticated tenant/facility.
No cross-facility recall propagation or notification delivery is implemented.
The SQLite change adds a scoped instrument-block table; prior records are retained.
Atomic rollback and competing SQLite connections are covered by scoped tests.

The preview rejects more than 100 affected packages, 1,000 original instruments or
1,000 queried snapshots in either lineage source collection with RECALL_LIMIT.
It does not save a partial recall; larger cases need a full scope review and a later
scalable recall-job implementation. Operational validation, physical reconciliation,
partial returns, repair, production clearance policies and authorized cross-site policy remain pending.
See RSP-ISS-004 and TESTING-REGISTER.md. RSP-ISS-001 independent inspection remains
parked at the owner's request.

## Authorized clearance update

[RECALL-CLEARANCE.md](RECALL-CLEARANCE.md) now supplies reviewer clearance and operator
fresh receiving. Closing alone still does not lift restrictions, and old package/label
blocks remain. Cleared cases cannot be extended; new incidents require a new recall.
