# Scan-assisted receiving and cleaning linkage

## Update and one owner check

Stop the preview with Ctrl+C, then run in the platform repository:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm sterile:preview
```

After **Ready**, refresh. **U-RECSCAN-01 pending:**

1. Enter as **Demo operator** → **Receiving and cleaning**.
2. Click **Prepare fictional receiving scan example**. Receiving details are prefilled;
   a separate fictional instrument is registered but no receipt is saved yet.
3. Click **Simulate receiving scan** to add the instrument to the receiving list.
4. Tick **I confirm receipt of these instruments for reprocessing**.
5. Click **Save receipt**.

Expected: **Record saved**, a new **Received** episode containing the instrument, and
**Internal identifiers recorded at receiving** showing its linked identifier. This is
one owner smoke check. Cleaning/inspection and broader exception walkthroughs are
verified separately or deferred; do not perform additional owner checks for this build.

Spanish equivalents: **Recepción y limpieza** → **Preparar ejemplo ficticio de escaneo
de recepción** → **Simular escaneo de recepción** → confirm receipt → **Guardar recepción**.
Expected **Recibido** and **Identificadores internos registrados en recepción**.

## Workflow and confirmation

The ordinary receiving form now includes **Scan into receiving list**. Focus **Receiving
instrument scan identifier**, scan or type a complete internal RSP-I token, then press
Enter or click **Scan and add to receiving list**. Enter within this field adds only to
the draft list; it never submits the surrounding receiving form. Physical keyboard
scanner setup remains plain payload plus Enter, as described in INSTRUMENT-SCANNING.md.

Each lookup fetches current instrument state. Duplicate, unknown, foreign, retired,
maintenance-held, currently processed, recalled or actively assigned instruments are
refused by the scan picker. The list holds at most 100 instruments. The scanned record
is added to form options even when outside the loaded instrument page.

Scanning is read-only until receipt confirmation. A changed instrument list resets
confirmation, so the operator must confirm the final list. Removing an instrument also
removes its staged scan provenance. Manual selection and scanning may be mixed; only
identifiers actually entered through the scan field are recorded as scan provenance.
The draft lives in the form and is covered by the existing unsaved-work/discard guard.

On **Save receipt**, the server validates complete/unique identifiers, correspondence
with the selected members, facility scope, required receiving details and confirmation.
It rechecks every member's current lifecycle, custody, processing and recall restrictions
inside the same transaction that creates the episode and reserves its processing holds.
A hold added after the initial scan therefore prevents the scanned receipt from saving.
Legacy recall restrictions also require their dedicated clearance/admission workflow;
ordinary scanned receiving does not remove a recall or restore old packages/labels.

No receipt, partial holds or identifier provenance survives a failed transaction. Audit,
receipt/idempotency data, initial snapshot and all reservations commit atomically. A
retry returns the same result; another receipt cannot claim the same instrument.
Existing manual receiving retains its prior policy and request format.

## Cleaning, inspection and traceability

The saved episode begins **Received**, with zero cleaning attempts or inspections. Its
receiving snapshot stores canonical internal identifiers linked to the actual member
IDs, alongside source, custodian, condition, discrepancies, operator and timestamp.
The normal **Start cleaning**, cleaning result and inspection workflows continue from
this episode and preserve that provenance in subsequent versions. Nothing from a prior
processing cycle is treated as new cleaning or inspection evidence.

Read-only traceability includes receiving identifier facts. The saved identifier means
an internal token was entered or simulated and receipt confirmed; it does not certify a
physical barcode scan, physical recovery or cleaning. Independent cleaner/inspector
separation remains parked under RSP-ISS-001.

## Validation and remaining work

**Developer passed November 6, 2026:** 260 scoped automated tests (137 domain,
98 service/SQLite/HTTP, 25 web API/export/symbol), scoped builds and a Chromium check of
setup without receipt, simulated staging, confirmation reset, duplicate rejection,
Enter-key submission safety, confirmed fresh receiving with provenance/hold and refresh
persistence. Domain checks carry the saved identifier through new cleaning/inspection;
service/SQLite checks cover roles, CSRF, strict input, scope, concurrent reservation,
reopen persistence, idempotent retry and late audit rollback.

U-RECSCAN-01 remains pending. Deferred M-RECSCAN-01: owner mixed lists/removal, post-scan
hold/conflict, cancellation and extended histories; M-RECSCAN-02: physical scanner/focus,
Windows, ES/FR/mobile, batches/limits and label/printer acceptance; M-RECSCAN-03: full
receiving-to-cleaning/inspection-to-release operational acceptance and production identity.
No new equipment command, physical cleaning or clinical release is performed by this
increment. RSP-ISS-007 retains the wider scanning backlog.
