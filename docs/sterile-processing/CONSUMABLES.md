# Consumable lots and packaging provenance

## One owner check: U-CONS-01 (passed November 10, 2026)

Owner screenshot confirms the saved lot, supplier reference, expiry and Within recorded expiry. Original check: update and restart the preview, enter as **Demo operator**, then open **Consumable lots** → **Prepare fictional lot example**. Review the prefilled fictional wrap, supplier reference and expiry, tick **I confirm this consumable lot record.**, then **Save lot record**. Expect **Lot record saved.** and the lot in the table. This is the only requested owner check. Packaging selection, frozen references, package-use lookup and reload are developer-verified.

## Delivered behavior

- Operators register wrap, pouch and indicator lot records. Reviewers and auditors read them. Registration requires a unique facility record code, product name, manufacturer lot number, supplier, supplier reference, expiry day and explicit confirmation. The record is immutable; registration does not establish approved compatibility or physical stock availability. Two deliveries may intentionally share a manufacturer lot number but have distinct facility record codes.
- Expiry uses an explicitly inclusive UTC calendar day: a lot is usable until the next UTC midnight. Past-expiry records can be registered to document existing stock, but are visibly expired and unavailable for new packaging. Invalid calendar dates are rejected. Manufacturer/site expiry interpretation remains a production configuration requirement.
- New UI packaging requires exactly one registered wrap or pouch lot and may include an indicator lot. The server rechecks expiry and scope within the packaging transaction, verifies material/name and manufacturer lot against the primary selection, and freezes complete selected records in the saved package. Existing package expiry policy remains separate: consumable expiry after packaging does not automatically expire or recall an existing package.
- Package detail and historical versions retain the saved lot, supplier, reference and expiry. Traceability facts/CSV also include frozen lot provenance. An old API client may omit lot IDs; resulting packages remain explicitly unlinked legacy references, with no automatic catalogue match or inferred provenance.
- **View package use** lists packages linked to the exact registered lot ID, including voided packages. It is a paged read-only provenance lookup, not a recall assessment, current clinical status or permission to use. Separate catalogue records with the same manufacturer lot must be reviewed separately. Existing recall controls remain explicit.
- Registration and packaging use existing CSRF, strict HTTP fields, scoped permissions, command idempotency, atomic audit and rollback. Package-use reads require both consumable and packaging read permissions. Catalogue lists use 50 rows plus sentinel; selectors fetch at most 1,000 lots and fail explicitly beyond that limit instead of silently omitting records. Usage queries bind lot/scope/page and return at most 50 rows plus sentinel.
- SQLite adds the scoped `sp_consumables` table without rewriting existing records. Production migrations, indexes and scale acceptance remain separate work.

## Deferred work

Stock corrections/adjustments, supplier catalogues, barcode/GS1 ingestion, attachments, product/method compatibility approvals, catalogue corrections, multi-lot allocation by quantity, cross-record manufacturer-lot search, automatic consumable incidents/holds and bulk recalls and automated expiry alerts are not part of this increment. Physical verification, broader owner packaging/exception/language/mobile workflows and clinical/production acceptance remain deferred. RSP-ISS-001 stays parked; no independent-inspector enforcement change is included.

Developer verification November 9, 2026: 379 scoped tests passed (205 domain, 133 HTTP/SQLite, 41 web), scoped builds and Chromium workflow passed. Coverage includes strict dates, expiry boundary, primary/indicator rules, duplicate/foreign selections, supplier snapshot retention, idempotency, audit rollback, CSRF/roles, SQL reopen, package usage, trace facts and browser save/select/package/lookup/refresh.

Reviewer withdrawal and separately confirmed per-package linked recalls are now delivered; see [CONSUMABLE-WITHDRAWAL.md](CONSUMABLE-WITHDRAWAL.md) for the current U-CONS-02 owner check.

Stock receipts, quantities used in packaging and explicit quarantine/disposal movements are now delivered. See [CONSUMABLE-STOCK.md](CONSUMABLE-STOCK.md) for units, legacy limits and the current U-CONS-03 owner check.
