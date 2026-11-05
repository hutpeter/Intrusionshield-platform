# Instrument identification and Data Matrix lookup

## Update and one owner check

Stop the preview with Ctrl+C. In the platform repository run:

```powershell
git pull --ff-only origin feature/sterile-processing-preview
pnpm install --frozen-lockfile
pnpm sterile:preview
```

This build adds a label encoder dependency; installation is required once. After
**Ready**, refresh the browser. No scanner purchase is needed for this check.

**U-SCAN-01 passed November 5, 2026** from owner screenshots. Original check:

1. Enter as **Demo operator** and open **Instruments**.
2. Click **Prepare fictional scan example**. A separate fictional instrument is
   created with a recorded maintenance hold; its Data Matrix label is displayed.
3. Click **Simulate this scan**.

Expected: the matching `SCAN-DEMO…` instrument opens, **Instrument found — current
record loaded** appears and **Maintenance hold — unavailable** remains visible.
Simulation submits the actual internal identifier to the same server lookup used by
keyboard input; it does not open a hardcoded record or change operational status.
Only this one owner check is requested. Physical scanner/printer testing is deferred.

Spanish: **Instrumentos** → **Preparar ejemplo ficticio de escaneo** →
**Simular este escaneo**. Expected **Instrumento encontrado — registro vigente cargado**
and **Retenido por mantenimiento — no disponible**.

## Identity and label rules

Every instrument detail/list projects a stable internal identifier:
`RSP-I-<instrument UUID in uppercase>`. Existing instruments receive the same projection
without a migration, version change or history rewrite. The underlying UUID is unique
within the facility store; lookup always uses the authenticated tenant and selected
facility. A token never selects or authorizes another facility. Internal instrument
code and manufacturer serial number remain unchanged and separate.

The Data Matrix encodes this exact internal token as plain data. It is **not** a GS1
DataMatrix, manufacturer UDI, URL, secret, signature or authorization credential.
This increment does not parse external manufacturer codes or UDI application identifiers.

The browser generates a vector SVG locally using pinned bwip-js; no instrument data
is sent to an external encoder. The encoder is loaded only when a label is displayed.
The label includes the internal instrument code, readable token and separate manufacturer
serial number. Its warning explicitly states that identity is **not evidence of sterility
or availability**. No mutable status is printed as a release claim.

**Print identification label** opens the browser's print dialog and isolates the label.
It is disabled until the symbol image is loaded. Printing does not record physical
printing or authorize application of a label to an instrument. Materials, adhesives,
marking placement, reprocessing compatibility, printer resolution, label dimensions,
physical durability and clinical/device instructions require local validation. The
preview's sample size is not a production label specification or DPM marking instruction.

## Keyboard scanner operation

On **Instruments**, focus **Scan or enter internal identifier**, enter the full token,
and press Enter or click **Find instrument**. A USB/Bluetooth 2D imager configured as
a keyboard with plain payload plus an Enter suffix can use the same field. This is an
explicit focused-field lookup; the application does not intercept keystrokes globally.

Leading/trailing whitespace is trimmed and case is accepted. Tokens must contain the
complete RSP-I prefix and a valid UUID. Partial identifiers, URLs, manufacturer serials,
unsupported symbology/AIM prefixes and excess/ambiguous query fields are rejected.
Configure the scanner to omit AIM prefixes for this increment. Unknown and foreign
records do not open an instrument or imply that it is available.

Every lookup fetches the current scoped instrument record, including maintenance,
processing, active assembly and recall restrictions. It opens the instrument details
and refreshes history. It is read-only: it never records receipt, tray membership,
inspection, repair, release, issue or physical scanning evidence. All preview roles
can look up records; existing role rules still protect mutations. The fictional setup
button is explicitly operator-only and protected by the existing same-origin CSRF gate.

## Validation and deferred work

Developer verification covers 243 scoped tests (126 domain, 94 service/SQLite/HTTP,
23 web API/export/symbol), scoped builds and targeted browser verification. An independent
ZXing decoder checks the exact token encoded in the generated Data Matrix; the browser
check also decodes the rendered SVG, checks print isolation, simulated scan, keyboard
Enter, invalid/unknown input, auditor lookup and current maintenance hold.

Owner U-SCAN-01 passed November 5, 2026. Deferred: M-SCAN-01 real 2D scanner, Enter/suffix/layout
settings and focus handling on Windows; M-SCAN-02 label printer, dimensions, print scale,
quiet zones/contrast, adhesives/durability and physical scan verification; M-SCAN-03
DPM equipment/marking policy, manufacturer UDI/GS1 parsing, camera scanning and ES/FR/mobile;
M-SCAN-04 scan-assisted receiving, tray assembly, packaging, load/issue actions with their
own confirmation and evidence rules. No production or clinical acceptance is claimed.

## Operational tray scan update

[TRAY-SCANNING.md](TRAY-SCANNING.md) now adds confirmed scan-to-draft with server-side
type, quantity, hold and assignment checks. Other operational scan actions and physical
hardware validation remain deferred.
