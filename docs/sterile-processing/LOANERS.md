# Loaner and vendor-owned instrument sets

## One new owner check

**U-LOANER-01 pending:** as Demo operator:

1. Open **Loaner and vendor sets** in the sidebar.
2. Click **Prepare fictional loaner receipt example**.
3. Review the supplier and expected instrument, tick both confirmations, then **Save loaner receipt**.

Expect **Loaner record saved**, **Received — with facility**, supplier **DEMO-SUPPLIER**,
one expected instrument, a **Linked receiving episode**, and **Loaner receipt and
hand-back history**. This tests only the saved initial receipt. No cleaning or supplier
hand-back is requested from the owner in this build. The example creates a fictional
instrument type; the confirmed receipt creates new records and preserves existing data.

## Ownership and receiving

A supplier/owner and supplier set reference are recorded separately from the authenticated
facility holding the instruments. `ownerFacilityId` remains the facility isolation/hosting
field used by the existing core; `externalOwnership` explicitly records supplier ownership.
It contains the receipt ID/code and frozen supplier/reference. No existing instrument is
relabelled. Only new internal codes and current local instrument types are accepted.

The operator declares each expected member individually (1–100), with internal code,
type and optional serial. This is a manually entered expected manifest, not an independently
verified supplier packing list, UDI or signature. Complete contents and receipt/ownership
must be separately confirmed. Missing or unexpected arrival contents are not silently
admitted; they require an exception procedure outside this initial loaner receiving flow.
An optional calendar return date is a documented expectation, not an automated due notice.

Receipt atomically creates registered vendor-owned instrument identities, immutable member
snapshots, a fresh `received` processing episode, processing reservations, version one,
audit attribution and retry receipt. Existing codes, foreign types, invalid dates, duplicate
members and unchecked declarations are rejected without partial writes. No inspection,
sterility or clinical release is inherited. Continue in Receiving and cleaning using the
linked episode. The existing processing/inspection/assembly/package/cycle/review controls
apply normally. Receipt source and ownership remain attached through that work.

New receiving requires `loaners:write`, `instruments:write` and `processing:write`. A loaner
write grant alone cannot create instrument identities or processing holds. Reads require
`loaners:read`; the preview operator writes, while reviewer/auditor read. Browser writes
use the existing exact-origin and CSRF checks; caller-supplied scope or actor fields are
not accepted. The fixture setup route is development/operator-only.

## Supplier hand-back

The separately confirmed **Record supplier hand-back** action records the complete original
set, a manually entered recipient, reference, observation, actor/time and server-generated
processing proof. Each member must still belong to this loaner, be registered, have current
passed inspection and be free of active tray/processing/repair/recall restrictions. The
server checks the exact member set, current instrument versions and latest processing
versions. A service-count threshold may remain due for work by the supplier: hand-back
does not reset its counter or permit clinical use. Sets with missing items, damage/repair,
active custody or unresolved recalls cannot be handed back through this complete-set path.

Hand-back creates version two and attributable history while retaining the original receipt
and processing links. The instruments keep their historical identities and supplier owner;
they are not retired or restored to local stock. Their loaner state becomes `returned`.
Ordinary/scanned receiving, tray membership, packaging, repair and recall readmission reject
instruments whose recorded loaner has been returned. Service-due records outside the facility
are excluded from the operational maintenance queue. Instrument details and traceability
show supplier custody, and the original receipt version remains readable.

Recipient references are not digital signatures, supplier acknowledgements, transport
tracking or notifications. A later physical visit requires a future explicit readmission
workflow that preserves these identities; do not recreate an old instrument under a new
code. Serial uniqueness across suppliers/visits and manufacturer identity have not been
validated. Corrections, shortage arrival/hand-back, vendor master/contract approval,
calendar alerts, cross-facility movements and production hand-back policies remain deferred.

## API and persistence

- `GET /loaners?page=1`, `/loaners/:id`, `/loaners/:id/history?page=1`, and
  `/loaners/:id/versions/:version` are facility/tenant scoped. Lists use 50-row pages
  and omit full manifests/hand-back proofs; details and saved versions retain them.
- `POST /loaners` saves a confirmed complete new receipt. `POST /loaners/:id/return`
  checks the current loaner version and complete accounted membership. Both reject extra
  fields and use command idempotency, atomic audit and immutable saved versions.
- SQLite development tables `sp_loaners` and `sp_loaner_versions` extend existing preview
  databases on startup without rewriting existing records. These are development adapters,
  not a production database/clinical validation claim.
- Instrument details/scanned lookup project ownership and current loaner state with a
  receipt link. Processing has a `loanerSource`. Trace reports show ownership, receiving
  provenance and supplier-returned alerts; receipt/history lives in the loaner workspace,
  rather than a new trace graph root type.

## Verification and deferred work

Developer November 7, 2026: 319 scoped tests (172 domain, 114 service/SQLite/HTTP, 33 web),
scoped builds and browser walkthrough. Coverage includes atomic fresh receipt/holds,
non-relabelled facility instruments, strict manifests/dates/scope, role/source grants/CSRF,
retry/race/audit rollback, SQLite reopening, passed-processing hand-back, active custody and
recall refusal, supplier-returned re-entry denial, historical versions, trace ownership and
read-only views. Browser checks cover both receipt confirmations, supplier/contents/history,
processing and ownership links, early hand-back refusal, simulated processing then confirmed
hand-back, version-one retention and refresh persistence with no browser errors.

U-LOANER-01 remains pending. M-LOANER-01: owner processing/hand-back, recall/repair/shortage
intersections, membership/error/history and concurrent transition checks. M-LOANER-02:
Windows/ES/FR/mobile/accessibility, physical supplier manifests and acknowledgement,
large sets and production identity/competency/vendor-policy acceptance. These remain deferred.
RSP-ISS-001 independent inspection stays parked.
