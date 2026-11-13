# Receipt cancellation — November 13, 2026

**Cancel receipt** is available to authorized reviewers on an ordinary **Received**
receipt before any cleaning attempt or inspection. It requires a cancellation
reason, reference and explicit confirmation. Editing either field clears confirmation.
The form itself can be discarded without changing the receipt.

Cancellation is permanent for that record. It saves state `cancelled`, a new frozen
version, actor/person attribution, timestamp, reason/reference and an audit event.
Original code, contents, admission details and versions remain readable. Cancelled
records remain listed with their explicit state; they cannot start cleaning or be
corrected or cancelled again through a new command. They leave the cleaning queue.

Only this episode's receiving holds are released, with ownership checks on every
instrument. Incident holds and recall blocks remain untouched and continue to
prevent blocked work. Cancellation records no cleaning, inspection or release and
confers no clinical approval. An unblocked instrument can be received again under
a new receipt code. Replaying the original cancellation returns the original result
without disturbing any newer receipt's holds.

## Scope and authorization

The server requires the separate `processing:cancel` permission, trusted current
person identity, facility/tenant scope and CSRF protection. Preview reviewers have
it; operators/viewers do not. Real-account users require an explicit grant; this
increment does not automatically grant existing users new authority. Workspace read
permissions are also necessary.

Receipts linked to returns, recalls, maintenance or loaner admissions cannot use
this action. Those workflows carry source obligations and require their own
resolution. The earlier owner's loaner receipt used for the correction check is
therefore intentionally ineligible for cancellation. Post-cleaning amendments and
linked-admission cancellation remain outside this increment.

Expected-version checks serialize cancellation with cleaning/correction and other
cancellation requests. Current record, released holds, frozen version, audit and
idempotency receipt commit together or roll back together. Optional cancellation
metadata and a new JSON state need no reset or migration of existing local stores.

## Verification

**242 domain, 183 service, 95 web and six account-runtime tests passed** (526).
Core/service/web builds passed; the web build retains the existing bundle-size
warning. Tests cover strict payloads, scope, roles/CSRF, invalid evidence, linked
admission denial, terminal transitions, frozen originals, audit rollback,
restart, another receipt's holds, replay after re-receipt, incident/recall block
retention, and competing cleaning/cancellation transactions across SQLite connections.
Chromium verified operator exclusion, reviewer form, confirmation reset, discard,
save, original version, released receiving hold, terminal UI/history, reload and
French mobile layout. Tests used isolated local stores and fake SQL; no owner
records, live identity database or equipment were accessed.

## Single owner check — U-CANCEL-01 (pending)

After updating the preview, as **Demo reviewer**, open **Receiving and cleaning**
and **View details** for an ordinary receipt marked **Received**. Select
**Cancel receipt**, confirm the reason/reference and confirmation are present,
then use **Cancel** and confirm discarding. Do not submit cancellation for this
check. Loaner, returned, recall or maintenance-linked receipts have no such action.
This checks availability and discard only; developer-verified cancellation does
not imply owner acceptance of the save workflow or operational readiness.
