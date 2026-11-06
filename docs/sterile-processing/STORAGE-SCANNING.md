# Scan-assisted storage and distribution

## Update and one owner check

Stop the preview with Ctrl+C, then run in the platform repository:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

After **Ready**, refresh. **U-STORESCAN-01 pending:**

1. Enter as **Demo operator** → **Storage and distribution**.
2. In **Scan released package**, click **Prepare fictional storage scan example**.
3. Click **Simulate storage scan**. It opens **Record storage** for that released package.
4. Keep `DEMO-SCAN-STORE-A` and the fictional reference; tick the integrity and movement
   confirmation checks.
5. Click **Save storage**.

Expected: **Movement saved**, **Stored**, location **DEMO-SCAN-STORE-A**, and the package's
release/source and movement history retained. Only this one owner check is requested.
The separate older **Prepare fictional distribution example** button sets up an issue
example; use the storage-scan button named above for this build.

Spanish: **Almacenamiento y distribución** → **Escanear paquete liberado** →
**Preparar ejemplo ficticio de escaneo para almacenamiento** → **Simular escaneo de
almacenamiento** → checks → **Guardar almacenamiento**.

The explicit setup creates fictional cycle/review prerequisites with separate operator
and reviewer attribution. It records simulated release but **does not store or issue**
the package. Your scan is read-only, and your storage confirmation is a separate write.
No real equipment, clinical processing, notification or physical handover is performed.

## Lookup and movement rules

On the distribution list, focus **Storage and distribution package identifier**, scan/type
a complete version-bound RSP-P package token and press Enter or **Find released package**.
The simulated action uses the same token/lookup service as keyboard input. No global
keystroke capture or camera permission is introduced.

The lookup runs in the authenticated tenant/facility. It validates the current package
version, current load membership and review version, final release decision and matching
package snapshots. Unreleased, held/rejected, recalled, returned, voided, stale-label and
already-issued packages are refused. An unknown/foreign package does not open a movement
form or confer availability. Printed identity never substitutes for current release.

- A released package without a movement record opens **Record storage** with that package
  selected. Review the storage location/reference and confirm package integrity and the
  movement before saving. The demo supplies fictional values; ordinary scans do not.
- A currently stored package opens its existing record, displaying its saved location and
  history. Use the existing **Record transfer** or **Record issue** controls as applicable.
  Issue requires department/destination, recipient and reference. Initial storage remains
  a prerequisite; this increment does not bypass it with direct issue from the scanner.
- Scanning alone records no movement or physical scan evidence. The existing write
  commands revalidate release, package version, recall/return restrictions and current
  movement state/version atomically. A restriction introduced after lookup prevents
  saving. Stored/transfer/issue events retain location/handover history and attribution.
- Already issued packages cannot be reopened for another issue or silently restocked.
  Return, recall and reprocessing remain separate workflows.

Lookup returns only the package summary/release reference and any existing movement
record; it does not expose instrument inspection proofs or assembly snapshots.

The scanner UI is an operator workflow. Its lookup endpoint is read-only for all roles
with distribution-read permission; mutation permissions remain unchanged. Setup is
operator-only and CSRF-protected; its simulated reviewer decision uses a separate scoped
actor. No bearer credential or caller-supplied actor/tenant is accepted from the browser.

## Verification and deferred work

**Developer passed November 6, 2026:** 275 scoped automated tests (146 domain,
101 service/SQLite/HTTP, 28 web API/export/symbol), scoped builds and a Chromium walkthrough.
Checks include release-only scoped lookup, unstored/stored selection without mutation,
held/rejected/stale/foreign/issued/recall/return rejection, movement revalidation after
scan, audit rollback and nested response-scope protection. The existing scoped suite
continues to cover storage/transfer/issue persistence, race and idempotency rules.

The browser check verifies setup without storage, correct package/form selection,
integrity plus movement confirmation, saved `DEMO-SCAN-STORE-A`, one storage event and
Enter-key rescan opening the existing record with issue action available. Developer
checks do not establish owner or physical acceptance.

U-STORESCAN-01 remains pending. Deferred M-STORESCAN-01: owner transfer/issue/exception,
post-scan restriction and history walkthroughs; M-STORESCAN-02: physical scanner/focus,
Windows, ES/FR/mobile, labels/printer and location vocabulary; M-STORESCAN-03: physical
handover/recipient acknowledgement, production identity/policy and full operational
acceptance. RSP-ISS-001 independent inspection remains parked. RSP-ISS-007 retains the
wider DPM, UDI/GS1, camera, return-scan and hardware backlog.
