# Scan-assisted draft tray assembly

## Update and one owner check

Stop the preview with Ctrl+C and run in the platform repository:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

After **Ready**, refresh. **U-TRAYSCAN-01 pending:**

1. Enter as **Demo operator** and open **Trays**.
2. Click **Prepare fictional tray scan example**. It opens a new empty draft requiring
   one fictional instrument. Its internal scan identifier is prefilled.
3. In **Scan into draft tray**, tick **I confirm this instrument is being placed in this tray**.
4. Click **Simulate instrument scan**.

Expected: **Instrument added by scan**, **Assigned: 1**, **Missing: 0**, with the matching
instrument in the saved contents. The tray stays **Draft**. This is the only requested
owner check. Do not complete the tray as an additional test now.

Spanish equivalents: **Bandejas** → **Preparar ejemplo ficticio de escaneo a bandeja** →
**Confirmo que este instrumento se coloca en esta bandeja** → **Simular escaneo de instrumento**.
Expected **Instrumento añadido por escaneo**, **Asignados: 1**, **Faltantes: 0**.

The helper explicitly creates fictional receiving, cleaning and inspection prerequisites,
a definition and an empty draft. No physical cleaning or inspection is performed. It
never adds the instrument automatically. Each successful new setup request creates a
separate example; retrying a failed setup uses the same request ID safely.

## Operational scan flow

On a current **Draft** assembly, Demo operator can use **Scan into draft tray** while
outside the manual contents editor. Focus **Instrument scan identifier**, scan or type
the complete internal RSP-I token, confirm placement and click **Scan and add instrument**
or press Enter. A physical keyboard scanner requires the same plain-payload/Enter setup
as instrument lookup. The explicit placement confirmation is required for each addition.
The simulation button uses the same API with the fictional instrument's actual token.

The service requires `trays:write`, current draft version and explicit confirmation.
Within one scoped transaction it resolves the complete token, checks that the instrument
is registered, rejects a duplicate, verifies its type against the draft's frozen required
composition and refuses an additional instrument when that type's required quantity is
already filled. Unknown/foreign records, retired/maintenance-held instruments, processing
holds, recall blocks and assignments to another active tray are rejected. Existing
members are rechecked through the normal tray eligibility gate too.

A successful addition reserves the instrument, increments the assembly version, freezes
new contents/history and records **Instrument added by scan** with instrument code/token,
operator and timestamp. Retry receipts prevent duplicate mutation; changed retries,
stale versions and competing reservations cannot silently overwrite a tray. An audit
failure rolls back contents, assignment, history and receipt together.

This operation saves a single instrument to the draft immediately; it is separate from
the manual **Edit contents / Save contents** workflow. It does not silently change the
tray definition, complete the assembly, assert physical scanning or certify cleanliness,
sterility or clinical availability. Required/missing/excess counts remain visible.
**Complete assembly** retains its separate composition confirmation, and later packaging,
cycle and release gates remain unchanged. Unsaved scan input/confirmation is protected
by the existing discard-navigation guard; editing and scan addition cannot run together.

## Verification and deferred work

**Developer passed November 5, 2026:** 252 scoped automated tests (132 domain,
96 service/SQLite/HTTP, 24 web API/export/symbol), scoped builds and a Chromium walkthrough:
confirmation gate, assigned 0→1/missing 1→0, draft retained, duplicate rejection without
count change, keyboard Enter and one audit entry. Automated coverage includes wrong type,
excess quantity, maintenance/retirement/processing/recall/other-tray blocks, current
version, facility scope, CSRF/operator-only writes, retry receipts, competing SQLite
connections, reopen persistence and late audit rollback.

Owner U-TRAYSCAN-01 remains pending. M-TRAYSCAN-01: owner exception/conflict/history and
manual-edit interaction walkthroughs; M-TRAYSCAN-02: Windows keyboard scanner/focus,
Spanish/French/mobile and repeated scanning; M-TRAYSCAN-03: physical placement/label
validation and full processing-to-release acceptance. The existing physical scanner,
printer/DPM, manufacturer UDI/GS1 and other operational scan-action backlog remains.
Independent cleaner/inspector separation remains parked under RSP-ISS-001.
