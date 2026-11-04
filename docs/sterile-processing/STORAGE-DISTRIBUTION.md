# Storage and distribution

November 4, 2026. Standalone fictional-data preview. See
[TESTING-REGISTER.md](TESTING-REGISTER.md) for completed and deferred checks.

## Update and one short owner check — U-DIST-01

Stop the preview in PowerShell with **Ctrl+C**, then:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for **Ready: http://127.0.0.1:9553**, leave PowerShell running and refresh.

1. Sign out if needed and enter as **Demo operator / Operador demo**. The reviewer
   can read movements but cannot record operator handovers.
2. Open **Storage and distribution / Almacenamiento y distribución → Prepare
   fictional issue example / Preparar ejemplo ficticio de entrega**.
3. The new fictional package already has simulated prerequisites, a separate
   reviewer release and storage at `DEMO-STORE-A`. Leave the prefilled demo
   destination, recipient and handover reference.
4. Check package integrity and the final confirmation, then **Save issue /
   Guardar entrega**.
5. Expected: **Issued / Entregado**, the destination/recipient, and a movement
   chain retaining the earlier **Stored / Almacenado** entry.

This is the only requested manual check. The storage prerequisite is simulated;
this result does not count as a separate owner test of initial storage or transfers.
Existing records remain intact. No physical dispatch, patient data, recipient
signature or real clinical use is requested.

## Implemented behavior

An initial storage record identifies one whole package and the exact package,
load and review versions behind its current release. It records the location,
reference, package-integrity confirmation, operator and server entry time.
A held, rejected, unreleased, voided or previously recorded package cannot start
another storage record. The client cannot authorize movement by supplying a
`released` flag or a different actor identity.

While stored, an operator may transfer a package to another location with a reason,
reference, integrity check and expected version. Each event retains the previous
and next locations. Issuing requires a destination, manually recorded recipient,
reference, integrity check and confirmation. The package leaves available storage;
its earlier locations and release attribution remain visible.

Every storage, transfer and issue rechecks the applicable current release, package
version, source-load version and load membership. A stale, amended or no-longer-
released source blocks the write; stored metadata alone is not accepted as
current authority. Actual release withdrawal remains a later workflow, not an
endpoint implemented by this stage.

An issued record cannot be issued twice, transferred, deleted or silently reset
to stored. Retries of the same request return its original result without changing
current state. Reusing a request key for a different handover conflicts. Return,
use, reprocessing and disposition need explicit later flows; see
[RSP-ISS-003](ISSUES.md#rsp-iss-003--returns-and-used-package-disposition).

## Traceability and authorization

A movement record preserves the package code/version, load code/version, release
record ID/version, release actor/time and the movement chain. Historical versions
are immutable and can be opened through **View version / Ver versión**. Package
views also show their current stored/issued status and location/destination.
Original packaging, cycle and review decisions are not rewritten.

The server permission is `distribution:write`, separate from `release:write`.
The operator fixture can store/transfer/issue; reviewer and auditor fixtures can
read but cannot write movements. Existing tenant/facility, session, CSRF and host
checks remain in place. Reviewer attribution and custody attribution are distinct.

New development SQLite tables `sp_distribution` and `sp_distribution_versions`
are additive. Foreign keys bind the original package, load and review versions.
Movement state, snapshots, audit and retry receipts commit together. Optimistic
versions and transaction locks prevent duplicate storage and competing issues.
No live SQL Server migration, device connection or external notification is used.

The example is deliberately **staged and idempotent**: simulated operator
prerequisites, simulated reviewer release, then simulated operator storage. Each
stage keeps its correct actor/audit transaction. If a later stage fails, identifiable
fictional prerequisites can remain; retrying the same example key resumes safely
without duplicating them. Real movement writes themselves remain atomic.

## Deferred operational acceptance

- Locations, departments and recipients are entered references, not governed
  registries, verified identities, countersigned receipt or delivery acknowledgements.
- Server times are entry times, not imported physical transport timestamps.
- There is no patient linkage, partial-package issue, environmental monitoring,
  expiry/FEFO policy, transport-condition evidence or automated availability guarantee.
- Returned or used packages cannot bypass receipt/reprocessing and integrity checks.
  The full return/disposition lifecycle is not implemented yet.
- Production withdrawal/recall must integrate with current stock/distributed items,
  printing and subsequent disposition. RSP-ISS-002 remains pending.
- Production identity/competency validation, approved local procedures, real
  equipment/printer checks and full end-to-end/manual regression remain deferred.

The single fictional handover smoke check does not satisfy these acceptance gates.
