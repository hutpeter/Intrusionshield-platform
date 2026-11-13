# Receipt corrections — November 13, 2026

Authorized reviewers can use **Correct receipt details** on a receipt in **Received**
state, before any cleaning attempt or inspection. Only source, handed-over-by,
condition and discrepancies can change. A changed value, correction reason,
reference and explicit confirmation are required. Editing a field clears confirmation.

The server requires `processing:correct` and a trusted person identity. Preview
reviewers have this permission; operators and viewers do not. Account mode requires
an explicit facility grant; adding the permission to the whitelist grants nobody access.
Reading the workspace also requires the appropriate read permissions.

Each correction saves a new version, attributed correction history and audit event.
Original receipt code, instruments, receipt actor/time, scan evidence and all holds
are retained. Original versions remain readable. No-op, stale, unconfirmed,
unscoped and unauthorized requests are rejected. Cleaning and correction compete
against the same version inside the transaction; only one can succeed. Audit failure
rolls back the correction, version and command receipt. Repeating a successful
request is idempotent. The optional correction-history field requires no migration
or reset of existing local stores. At most 50 corrections per receipt are allowed.

This does not provide changes to instrument contents, duplicate/wrong-instrument
receipt cancellation, post-cleaning amendments, inspection or release decisions.
Those remain separate correction requirements to assess for the pilot; this
increment does not establish complete MVP or clinical readiness.

## Developer verification

237 domain, 181 service, 94 web and six account-runtime tests passed. Core, service
and web builds passed; the web build retains its existing bundle-size warning.
Chromium verified operator exclusion, reviewer correction without cleaning-write
permission, original version and holds, attributed history, reload, cancellation,
French labels and mobile layout. Tests used isolated temporary stores and fake SQL;
no live identity database, owner data or processing equipment was accessed.

## Single owner check — U-CORRECTION-01 (pending)

In the updated preview as **Demo reviewer**, open **Receiving and cleaning**, then
**View details** on a receipt marked **Received**. Select **Correct receipt details**.
Confirm the receiving values are prefilled and **Correction reason** and
**Correction reference** are present; then **Cancel** and confirm discarding.
This checks form availability and cancellation only. Do not use a receipt already
cleaned; it correctly has no correction action. Developer save verification above
does not imply owner acceptance.
