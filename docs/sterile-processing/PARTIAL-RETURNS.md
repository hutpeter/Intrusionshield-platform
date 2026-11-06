# Partial returns and missing-instrument reconciliation

## One new owner check

U-PARTRETURN-01 passed November 6, 2026. As Demo operator:

1. Open Returns and reprocessing → Prepare fictional return scan example → Simulate return scan.
2. Select **Some expected instruments are missing.** The example has one expected instrument.
3. Leave its **Received instruments** checkbox unchecked and enter a **Discrepancy reason** (e.g. SIMULATED missing instrument).
4. Tick the accurate received/missing-list declaration and the separate return confirmation.
5. Click **Save discrepancy**.

Expected: **Return discrepancy — blocked**, **Missing instruments: 1**, **Received
instruments: 0**, preserved original issue, and no Record disposition action. Recording
zero received is permitted to document an all-missing incident; it does not assert physical
recovery. Only this new aspect is requested. Owner recovery and exception checks remain
deferred. This fixture creates a new fictional issued package; existing data is preserved.

## Behavior and boundaries

The scanned package lookup retrieves the immutable original expected manifest. The operator
selects only expected instruments physically received, supplies reason/location/custodian/
reference and explicitly confirms both the observed counts and the blocked return. The
server derives missing IDs; the browser cannot supply or suppress them. Unknown, duplicate,
foreign or complete sets cannot be saved through the partial endpoint. A complete receipt
continues through the existing separately validated complete-return path.

The saved return has state `discrepancy`, frozen expected manifest, cumulative received and
missing ID lists, original issue snapshot, actor and timestamps. Its initial location and
custodian describe the initial receipt, not the physical location of missing items. Original
package/assembly reservations are retained for every member, including missing ones; the
original issue remains historical and unchanged. The original package and its labels remain
unavailable. Another return, loading, storage, retirement or reprocessing cannot free these
members. Recall clearance cannot readmit a group with an unresolved return discrepancy.

**Record missing instruments received** is an operator-only, separately confirmed action.
Select a nonempty subset of currently missing expected members and record receipt location,
custodian, reference and optional observation. Each batch appends actor/time/evidence to
history, increments the version and retains earlier snapshots. It cannot remove prior
receipts or accept unexpected members. Active original custody is rechecked atomically.
Stale/duplicate submissions fail; a retry with the same request is idempotent. Audit failure
rolls back the entire mutation, history and retry receipt.

Once no members remain missing, state becomes **Returned — awaiting disposition**. No
processing episode, stock restoration, recall clearance or release is created automatically.
The existing reviewer disposition and fresh-cleaning gates remain required, including
separate damage and recall restrictions. Later receipt location stays attached to its batch;
this increment does not implement a physical inter-location transfer or notification system.

Only expected-member shortages are handled here. Unexpected instruments must follow a
separate exception procedure; notes may reference them but do not admit them into custody.
Incorrect receipt corrections, permanently missing/discard decisions, partial-member
reprocessing, verified person/competency and physical recovery acceptance remain deferred.
RSP-ISS-001 independent inspection stays parked.

## API and projections

- `POST /returns/partial`: returns-write permission; current issue/package identity;
  exact request fields; observed-list and return confirmations; strict expected subset.
- `POST /returns/:id/receive-missing`: returns-write permission; expected version;
  nonempty currently missing subset; confirmed receipt and evidence.
- Both retain scoped transactions, idempotency, audit and immutable return versions.
  Preview cookie writes require exact origin and CSRF. Reviewer/auditor cannot perform
  operator receipt actions. No user-supplied actor identity is accepted.
- Full detail/history include reconciliation. Summary lists omit its manifest/evidence.
  Package/distribution projections show the discrepancy state and retain return blocks.
  Dashboard **Returns awaiting reconciliation or disposition** includes discrepancies.
  Traceability includes counts, identities, later receipt actors/evidence and prior versions.
- SQLite development persistence stores the additional payload/state using existing return
  tables. It is not a production database adapter or operational validation.

## Verification

Developer November 6, 2026: 303 scoped tests (162 domain, 109 service/SQLite/HTTP, 32 web),
scoped builds and browser verification passed. Coverage includes a real three-member
processing/assembly/issue flow with partial receipt and two later batches, all-missing
receipt, immutable issue/reservations, disposition/recall-admission/receiving gates,
wrong/foreign/duplicate/stale/unconfirmed inputs, roles/CSRF/strict fields, retries/races,
audit rollback, SQLite reopening and historical trace facts. Browser verification covers
both confirmations, saved shortage/block, no disposition, refresh, later receipt without
auto-reprocessing and historical version one retaining its shortage.

U-PARTRETURN-01 passed November 6, 2026. M-PARTRETURN-01: owner later recovery, reviewer disposition,
recall overlap, competing changes, error/retry and historical walkthrough. M-PARTRETURN-02:
physical reconciliation, large manifests, Windows/scanners, ES/FR/mobile/accessibility and
production identity/procedure/clinical acceptance. Broader testing remains deferred.

Owner screenshot November 6, 2026 confirms Return record saved, Return discrepancy —
blocked, Received instruments: 0, Missing instruments: 1, saved discrepancy reason,
original issued contents/identifier and no Record disposition action. U-PARTRETURN-01
passed. Later receipt, disposition and broader M-PARTRETURN-01–02 remain deferred.
