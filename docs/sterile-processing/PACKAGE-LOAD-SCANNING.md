# Package Data Matrix and scan-assisted draft load assembly

## Update and one owner check

Stop the preview with Ctrl+C, then run in the platform repository:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

After **Ready**, refresh. **U-LOADSCAN-01 passed November 6, 2026** from owner draft/two-package/audit screenshot. Original check:

1. Enter as **Demo operator** → **Loads and cycles**.
2. Click **Prepare fictional package load scan example**.
3. In **Scan package into draft load**, tick **I confirm this package is being placed in this load**.
4. Click **Simulate package scan**.

Expected: **Package added by scan**, two packages in the saved draft, and the
`LOADSCAN-PACK…` candidate listed **once**. The example starts with one seed package;
your scan adds the second. The load remains **Draft**. Do not start the cycle as an
additional owner check for this build.

Spanish: **Cargas y ciclos** → **Preparar ejemplo ficticio de escaneo de paquete a carga**
→ confirm placement → **Simular escaneo de paquete**. Expected **Paquete añadido por escaneo**.

The explicit helper creates two separate fictional packages with simulated receiving,
cleaning, inspection, assembly and packing prerequisites. It creates a draft load with
one seed package and leaves the candidate unassigned. It does not start a cycle, communicate
with equipment or imply real clinical processing. The candidate addition is your explicit
action, never part of automatic setup. Repeated successful setup creates a new example;
retry IDs preserve failed setup recovery without duplicate records.

## Package identification and label

Current package details and lists project a version-bound internal identifier:
`RSP-P-<package UUID in uppercase>-V<package version>`. It is separate from instrument
RSP-I identifiers, manufacturer UDI/GS1 and human package codes. Existing packages need
no stored-record migration. Read projections never rewrite issued history or versions.

**Packaging and labels → package details → View label** now includes a locally generated
vector Data Matrix encoding the exact package identifier, plus the readable token. The
shared encoder also serves instrument labels. Printing is disabled until the symbol
loads, and the existing print preflight rechecks current package version/holds. Browser
printing isolates the preparation label and retains **NOT STERILE / NOT RELEASED**.
The identifier is not a release claim, expiry calculation, equipment compatibility check
or physical-print confirmation. Release-decision labels are unchanged.

Earlier text-only `RSP-PACK-1:…` identifiers remain historical references; this scanner
accepts only the new complete version-bound format. It never interprets old text as a
new authorization or rewrites a previously printed label. Physical label media, size,
printer resolution, quiet zones, adhesives/durability and DPM policy remain unvalidated.
The preview's rendering size is not a production marking instruction.

## Confirmed scan into a draft

On a current **Draft** load, outside manual contents editing, focus **Package scan identifier**,
scan/type the complete RSP-P token, confirm placement and click **Scan and add package** or
press Enter. The simulated action uses the actual fictional candidate token and the same
service command. Unsaved input/confirmation uses the existing discard-navigation guard.

The server requires `cycles:write`, explicit placement confirmation and the expected
current load version. In one authenticated tenant/facility transaction it:

1. Resolves the package UUID and exact version from the complete internal token.
2. Rejects a duplicate, stale label/load, non-draft load or unknown/foreign package.
3. Rechecks package state, active assembly/package reservation, returns, recalls and
   any other load assignment, including the existing load members.
4. Refuses changed versions of existing members rather than silently refreshing them.
5. Saves the new contents, reserves membership, freezes the load version and appends
   **Package added by scan** with package code/token, operator and timestamp.

The 100-package load limit remains. No partial addition is stored after a limit or gate
failure. Retry receipts prevent duplicate mutation; changed requests, competing SQLite
connections and late audit errors cannot silently produce a second assignment.

The scan is a recorded operator placement confirmation, not independently verified
physical scanner evidence. It does not start equipment, validate sterilizer parameters,
complete a cycle, authorize release or revive recalled/returned/voided packages. The
existing separate **Start cycle** review/confirmation and subsequent evidence/release
rules remain. Manual contents editing remains available as its own workflow, with earlier
scan events and load versions retained in history.

## Verification and deferred work

**Developer passed November 6, 2026:** 269 scoped tests (142 domain, 100 service/SQLite/
HTTP, 27 web API/export/symbol), scoped builds and a Chromium walkthrough. Checks include
version-bound/scoped lookup, independent Data Matrix decoding for both instrument and
package tokens, actual rendered package SVG decoding, label-only PDF with preparation
warning, print preflight, confirmation gate, saved draft count 1→2, candidate once,
duplicate rejection, keyboard Enter and audit/version history. Automated checks cover
void/recall/return/other-load gates, stale input, non-draft loads, roles/CSRF/strict bodies,
retry receipts, concurrent reservations, persistence and late audit rollback.

Owner U-LOADSCAN-01 passed November 6, 2026. Deferred M-LOADSCAN-01: owner exception/history/manual
edit and full cycle/release walkthrough; M-LOADSCAN-02: physical scanner/printer, Windows,
ES/FR/mobile, sizing/quiet zones/material durability and real equipment acceptance;
M-LOADSCAN-03: manufacturer UDI/GS1, DPM, camera and distribution/return scan workflows.
No production or clinical acceptance is inferred. RSP-ISS-001 independent inspection
remains parked; RSP-ISS-007 tracks the wider scanning backlog.
