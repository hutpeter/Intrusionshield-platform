# Sterilization loads and manual cycle records

November 4, 2026. Standalone fictional-data development preview. This increment
records load membership, cycle references and entered evidence; it does not
control equipment or authorize clinical release.

## Update and one short owner check — U-CYCLE-01

Stop the preview in PowerShell with **Ctrl+C**, then run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

Wait for **Ready: http://127.0.0.1:9553**, leave PowerShell running and refresh.

1. As **Operador demo**, open **Cargas y ciclos → Preparar ejemplo ficticio de ciclo**.
   New fictional prerequisites and a load with a simulated start are created.
   Existing instruments, trays, packages and loads remain unchanged.
2. In the result form, choose **Satisfactorio — requiere revisión**. Leave the
   clearly simulated evidence references and note as supplied.
3. Check the confirmation that records the result without authorizing release,
   then **Guardar resultado**.
4. Expected: **Pendiente de revisión — no liberado** with saved evidence/history.

This is the only requested manual check. No actual cycle, real equipment,
physical printing, failure/rework or repeated earlier-module walkthrough is requested.
See [TESTING-REGISTER.md](TESTING-REGISTER.md) for deferred review scenarios.

**Workflow update:** a separate manual review/release module is now available;
see [REVIEW-RELEASE.md](REVIEW-RELEASE.md). Original cycle outcomes remain fixed.
The owner's cycle smoke check has passed and need not be repeated for this build.

## Implemented workflow

`draft → running → awaiting_review | failed | aborted`

Only an unstarted draft can be cancelled. Creating a draft reserves 1–100
individually identified packages. Packages must be current, non-voided records
with their active packaging reservations. A package cannot belong to two active
loads. The load retains the package ID/code/version, assembly ID/code/version
and instrument count; the immutable package version retains its full inspection
and composition evidence.

Drafts can replace their package list with an expected version and confirmation.
Removed packages become available; earlier load versions retain their original
membership. Cancelling a draft requires a reason and releases its reservations.
It does not void packages or erase their packaging/inspection records.

Starting records the operator, server time and a machine-cycle reference. Membership
is then locked. The pair of sterilizer identifier and machine-cycle reference
cannot be recorded twice within the same tenant/facility. References use the same
letter/number/hyphen/dot/underscore identifier format as other preview codes.
A duplicate or stale start is rejected. Start records are entered observations,
not commands to equipment; server entry times are not imported machine timestamps.

Recording a result requires a cycle-evidence reference and explicit confirmation.
A satisfactory result also requires an indicator-evidence reference; a failed or
aborted result requires a reason. References are text, not verified files, signed
reports or device measurements. No physical/chemical/biological indicator result
is automatically interpreted. Later review must apply approved operational rules.

A satisfactory result becomes **awaiting review**, retaining all package holds.
Failed/aborted results likewise retain holds. Cycle endpoints themselves do not authorize release. A separate reviewer decision
is now recorded by the next increment; no sterile-availability flag is inferred
from the operator result. All three terminal outcomes are
immutable through the current UI; correction, rework and disposition need later
attributed decisions, not silent edits. Started loads cannot be cancelled to
bypass those holds.

## Packaging interlocks

A package assigned to any retained load cannot be voided. Its current package
view shows the load and its state; source package content/version remains fixed.
The existing label is still a preparation label marked **NO ESTÉRIL · NO LIBERADO**.
Recording a successful cycle does not silently change it into a release label.

Draft cancellation releases only that load's reservations. Cancelling/replaying
an older command cannot release a package now reserved by a newer load. Tray
membership and active packaging reservations remain in place.

## Authorization and persistence

Server permissions are `cycles:read` / `cycles:write`; preview auditors can read
loads, evidence, history and historical versions but cannot write or create
fictional prerequisites. Existing session, CSRF, host and scope controls remain.
Actor/tenant/release fields supplied in request bodies are not accepted as authority.
Independent inspector separation remains parked in [RSP-ISS-001](ISSUES.md).
Production cycle-review/release roles and separation of duties remain future work.

Load state, membership, machine-reference reservation, version snapshots, audit
and idempotency receipts are transactional. Draft/started/terminal historical
versions remain readable after later operations. Additive preview SQLite tables
are `sp_loads`, `sp_load_versions`, `sp_load_assignments` and `sp_machine_cycles`.
No SQL Server migration or real equipment/database connection is performed.

## Deferred acceptance and integration

- Approved equipment registry, maintenance/qualification, validated profiles and
  permitted material/method combinations. Current identifiers and profile versions
  are entered references, not verified configuration.
- Device data acquisition, actual start/finish times, numerical parameters,
  tolerances, attachments/signatures, indicator interpretation and biological
  incubation/pending-result policy.
- Authorized review, release/reject/hold decisions, amendments, failed/aborted
  cycle disposition, reprocessing, recall, distribution and expiry/label policy.
- Full Windows restart/manual failure paths, multilingual/mobile review, performance
  at production scale, physical equipment/printer validation and end-to-end testing.

These are tracked as pending/deferred, not passed, in the testing register.

## Package Data Matrix and draft-load scanning

See [PACKAGE-LOAD-SCANNING.md](PACKAGE-LOAD-SCANNING.md) for version-bound internal
package labels, confirmed one-package draft additions and the one fictional owner check.
