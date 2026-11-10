# Consumable lot withdrawal and linked recalls

## One owner check: U-CONS-02 (passed November 10, 2026)

Owner screenshot confirms the saved withdrawal, packaging block and simulated supplier notice. Original check: update/restart the preview, enter as **Demo reviewer** and open **Consumable lots**. On the fictional lot registered in U-CONS-01, click **Withdraw lot**. Its fictional decision reason and supplier notice reference are prefilled. Review them, tick **I confirm withdrawal of this lot from new packaging.**, then **Record lot withdrawal**. Expect **Lot withdrawal recorded.** and **Withdrawn — blocked for new packaging**. This is the only owner check. Do not create a recall for this check; the linked recall flow is developer-verified.

## Decision and scope

Withdrawal is a permanent decision for one exact tenant/facility lot record. Only reviewer `consumables:withdraw` permission can record it. Product/supplier attributes remain unchanged; the decision adds reason, evidence/notice reference, actor, time and a new optimistic version. No restore action exists. Replaying the same command is idempotent; stale versions and another withdrawal are rejected. Registration remains operator-only.

New packaging cannot select or save a withdrawn registered wrap, pouch or indicator. The backend rechecks the current lot inside the same packaging transaction, including when the form was opened before withdrawal. Existing saved packages keep their original lot snapshots and state; withdrawal alone does not create package or instrument holds, change release decisions or perform a physical recall.

**View package use** remains paginated and includes voided packages. For a withdrawn lot, reviewers can choose **Preview recall for this package**, then **Preview recall impact**. The preview uses the existing recorded-lineage/current-custody recall plan, displaying affected packages and instrument blocks. Creating a linked recall requires a separate confirmation, current lot version, current impact hash, unique case code, reason and reference. The server checks that the source package actually contains this exact lot ID and atomically saves the recall, persistent existing recall blocks, lot association and audits. Changed work makes the preview stale and must be reviewed again. Duplicate linked recalls for the same lot/source package are rejected.

Linked recall cases retain the lot record code, manufacturer lot number, supplier, withdrawal notice reference and withdrawal time. **Open recall** enters the existing recovery/disposition/clearance workflow; closing a recall never restores the consumable lot. Separate source packages can require separate recalls; this increment does not bulk-recall all lot uses or auto-extend recall scope.

## Security and persistence

Registration/read roles remain unchanged. Withdrawal and linked recall creation additionally require reviewer withdrawal permission. Recall preview/create require packaging read and recall read/write respectively, checked before repository access. CSRF, strict HTTP fields, tenant/facility scope, command idempotency, optimistic concurrency, transaction rollback and audit persistence use existing controls. SQLite updates the existing lot payload with a version predicate; no new table is needed. Saved package/recall versions retain their snapshots.

## Boundaries and deferred checks

This works only from exact registered lot IDs and recorded package provenance. Earlier unlinked API/package material strings are not automatically matched; manufacturer lot numbers shared across separate catalogue records require separate review. Registration/expiry do not verify physical stock, compatibility, supplier notice authenticity or clinical safety. Physical stock quarantine, supplier notifications, acknowledgments, bulk manufacturer-lot search, automatic holds/alerts, correction/restore, inventory quantities, production migrations/indexes/scale and broader manual/clinical/operational acceptance remain deferred. RSP-ISS-001 stays parked.

Developer November 10, 2026: 385 scoped tests passed (208 domain, 135 HTTP/SQLite, 42 web), scoped builds and Chromium registration/packaging/reviewer withdrawal/explicit recall preview/confirmation/source navigation/refresh passed. Validation includes original package immutability, withdrawn-lot server block, reviewer/CSRF/source permissions, stale preview/version, exact provenance, duplicate retry, audit rollback and SQLite reopen. U-CONS-02 subsequently passed from the owner screenshot.

Recorded stock receipts, packaging deductions, quarantine and disposal are now available; see [CONSUMABLE-STOCK.md](CONSUMABLE-STOCK.md). Withdrawal retains physical balances while making stock unusable for new packaging.
