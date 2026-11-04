# Cycle review and recorded release decisions

November 4, 2026. Standalone fictional-data development preview.
See [TESTING-REGISTER.md](TESTING-REGISTER.md) for completed and deferred checks.

## Update and one short owner check — U-REVIEW-01

Stop the preview in PowerShell with **Ctrl+C**, then:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for **Ready: http://127.0.0.1:9553**, leave PowerShell running and refresh.

1. Select **Salir / Sign out**. Choose **Revisor demo / Demo reviewer**, then
   enter the demonstration. This profile is distinct from the operator and auditor.
2. Open **Revisión y liberación / Review and release** and choose
   **Preparar ejemplo ficticio de revisión / Prepare fictional review example**.
   New fictional operator prerequisites are created; existing records are preserved.
3. Choose **Liberar / Release**. Leave the supplied simulated reason/reference.
4. Tick the four evidence/checklist confirmations and the final reviewer
   confirmation, then **Guardar decisión / Save decision**.
5. Expected: **Liberación registrada / Release recorded**, with reviewer attribution
   and decision history. This is a recorded fictional decision, not clinical use.

That is the only requested owner check. No physical printing, failed-cycle review,
hold/reject walkthrough or repeated earlier-module regression is requested now.

## Decisions and evidence

The pending queue includes completed successful, failed and aborted loads that
have not received a final decision, plus loads currently held for further review.
The reviewer sees the machine-cycle reference, operator cycle/indicator references,
profile/version, exact source load version and package versions. Every decision
needs a reason, review-record reference and explicit confirmation. **View package
and evidence / Ver paquete y evidencias** opens the exact package version,
material lot and linked per-instrument inspection evidence being reviewed.
Decisions apply to the whole load; split package disposition is not implemented.

- **Release:** requires a successful recorded cycle, all four review checks
  confirmed, intact active package/load associations and expected versions. A
  recorded cycle starter or finisher cannot release that same cycle, even if
  a caller has review permission. This compares verified actor IDs, not names.
- **Hold:** records the reason and evidence reviewed, keeps packages unavailable,
  and allows a subsequent versioned decision. Earlier held decisions stay visible.
- **Reject:** records a final decision and retains package/load restrictions.
  Reprocessing or other disposition requires a later authorized workflow.

Failed or aborted cycles cannot be released. A final release or rejection cannot
be overwritten through this API; withdrawals, corrections and recall must be
separate attributed workflows. See [RSP-ISS-002](ISSUES.md#rsp-iss-002--withdrawal-and-amendment-of-final-review-decisions).
No endpoint silently converts a failed cycle into a passed one.

The review is a separate record from operator work. It freezes the exact load
version and source evidence at its first decision; later held-to-release decisions
retain that snapshot and add immutable review versions. Source amendments cannot
silently reuse an older review snapshot. A review audit failure rolls back its
state, version and retry receipt together.

## Dedicated reviewer access

The server requires **release:write**, separate from operator writes. The local
fixture offers three profiles:

| Profile                       | Operator workflow writes | Review decisions | Read records |
| ----------------------------- | ------------------------ | ---------------- | ------------ |
| Operador demo / Demo operator | Yes                      | No               | Yes          |
| Revisor demo / Demo reviewer  | No                       | Yes              | Yes          |
| Auditor demo / Demo auditor   | No                       | No               | Yes          |

These are demonstration identities, not a production identity or competency system.
The reviewer may prepare explicitly fictional prerequisites, which are attributed
to the simulated operator. It cannot use normal operator APIs to change real
operator work. The actual decision is always attributed to the signed-in reviewer.

**RSP-ISS-001 remains deferred:** a separate cleaner/inspector role and no
self-inspection of cleaning have not been implemented by this release-review
feature. Production mapping of multiple accounts to one person, competency,
facility policies and cross-role separation still needs operational design.

## Package status and labels

Load and package views project the latest review decision. Their original cycle,
preparation and inspection records are not rewritten. A release decision is
available for the future distribution workflow, but the package retains its
load/assembly linkage and cannot be reloaded or voided through a clerical shortcut.
Hold/reject do not make packages available.

The original preparation label remains historical preparation evidence. After a
recorded release, its application print button is suppressed; stale print attempts
check current package state before opening a dialog. In the review module, a
separate **decision label** is available per released package, with package/load
references, machine-cycle reference, reviewer, decision time/reference and review
version. Its identifier is `RSP-REL-1:<review-id>:<version>:<package-id>`.

The label explicitly says **LIBERACIÓN REGISTRADA · DEMOSTRACIÓN** and **SOLO DATOS
FICTICIOS — NO USAR CLÍNICAMENTE**. It is not a clinical sterile-release certificate,
does not calculate expiry, and does not add a barcode/QR/UDI. Browser printing is
not proof of a physical print. Historical review versions and held/rejected
records cannot print a release label through this interface.

## Persistence and deferred validation

Additive preview tables: `sp_reviews` and `sp_review_versions`; existing load state
constraints and original JSON snapshots are preserved. Scope, session, CSRF and
host controls remain. Expected load/review versions protect concurrent reviewers;
idempotency prevents duplicate decisions. No live SQL Server, equipment or external
clinical service is used.

This is a minimal manual-review demonstration. Production requires approved
review checklists, actual indicator/biological evidence and timing policy,
validated profile/material compatibility, qualified identities and signatures,
expiry/storage/distribution rules, withdrawals/recall and operational acceptance.
Those are pending/deferred in the register; the fictional release check does not
validate them. The label avoids claiming that text references alone establish
sterility.
