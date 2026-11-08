# Ruby Sterile Processing — issues log

Updated November 8, 2026. Deferred requirements are recorded here so development
can continue without losing them. Deferral is not implementation or acceptance.
Keep test execution status in [TESTING-REGISTER.md](TESTING-REGISTER.md).

## RSP-ISS-001 — Independent inspector role and no self-inspection

- **Status:** Deferred at the owner's explicit request on November 4, 2026.
- **Source:** Owner feedback after successful inspection smoke check U-INSP-01.
- **Requirement:** Introduce a specific inspector role/permission. A person who
  performed cleaning must not inspect or confirm their own work, even if that
  person also holds the inspector role. Separate role membership alone is not
  sufficient; enforce separation by verified person identity for the episode.
- **Current gap:** The development preview uses the operator fixture for cleaning
  and inspection, authorized through `processing:write`. It records actors but
  does not enforce independent inspection. The successful smoke check verifies
  the current screen and saved result, not this separation requirement.
- **Implementation scope when resumed:** Add an inspection-specific server
  permission and UI affordances; compare the inspector's verified identity with
  the relevant cleaning actors. Define treatment of cleaning start versus finish
  actors, team cleaning, retries, reinspection and multiple accounts belonging
  to the same person. Retain actor attribution and deny attempted bypasses at
  the API. Changes to identity mappings must not rewrite historical attribution.
- **Acceptance checks to add:** Cleaner cannot inspect their own episode; merely
  granting the cleaner the inspector role does not bypass the restriction;
  a different authorized inspector can inspect; a different unauthorized person
  cannot; actor/header/body spoofing and concurrent submissions cannot bypass
  the rule. Cover failed cleaning, renewed cleaning and reinspection. Verify
  denied attempts leave holds, versions and saved results unchanged.
- **Validation gate:** Resolve before production clinical acceptance; not a
  blocker for the next dummy-data development increment. Do not introduce an
  override implicitly. Any exception policy needs explicit product approval.
- **Linked checks:** U-INSP-01 remains passed for the current preview;
  M-AUTH-01 and independent-inspection acceptance tests remain pending.

## RSP-ISS-002 — Withdrawal and amendment of final review decisions

- **Status:** Partially implemented by the withdrawal/recall increment.
- **Current behavior:** Final recorded release/rejection decisions are immutable.
  Holds can receive later versioned decisions; original evidence is retained.
- **Delivered:** Separate versioned package/load recall cases preserve final decisions,
  block downstream availability and normal label printing, and document recovery
  and disposition. Case closure retains the block; no notifications are sent.
- **Remaining scope:** Define authorized correction, rescission/reinstatement and
  failed-cycle disposition without rewriting historical decisions or allowing
  clerical cancellation to bypass package restrictions. Source evidence amendments
  need a new explicit review policy rather than silently reusing an old snapshot.
- **Acceptance checks:** Authorized withdrawal invalidates current release-label
  authorization and downstream availability; unauthorized callers are denied;
  prior decisions/labels remain historically attributable; subsequent disposition
  is explicit and audited. Validate stale labels, concurrent decisions and
  distributed items once distribution exists.
- **Gate:** Required before production operational acceptance. This does not
  unblock or implement the independently deferred cleaner/inspector issue above.

## RSP-ISS-003 — Returns and used-package disposition

- **Status:** Partially implemented by the returns/reprocessing increment.
- **Current behavior:** Complete issued-package returns preserve issue history and
  block the old package. Reviewer disposition can retain quarantine or atomically
  transfer unchanged, registered, non-damaged and non-recalled instruments to a new
  receiving episode. Quarantine retains reservations. No automatic restock exists.
- **Remaining scope:** Unexpected/mismatched returns and shortage corrections, explicit use/procedure
  records, damage repair, quarantine clearance, corrections, approved unopened-return
  handling and production policy. Recall blocks deny the current reprocessing shortcut;
  cross-episode recall propagation is tracked separately in RSP-ISS-004.
- **Acceptance checks:** Used/opened or damaged items never regain available stock
  merely because they were returned; unauthorized restocking is denied; a new
  processing episode remains linked to the old issue; withdrawal/recall affects
  both stored and distributed packages; old labels/history stay attributable.
- **Gate:** Required before production operational acceptance. Handling rules
  need approved local procedures; the current fictional demo assumes none.

## RSP-ISS-004 — Recall propagation across reprocessing lineage

- **Status:** Partially implemented in the local preview on November 5, 2026.
- **Delivered:** New recalls preview original targets, packages reached by recorded
  return/episode/inspection-proof links and affected instruments' current package
  custody. Persistent instrument blocks prevent later assembly/packaging and passed
  inspection from bypassing the recall. Original release/issue facts remain intact.
  Explicit reviewer extension upgrades older cases, retains their original versions
  and dispositions, adds targets and reopens recovery when necessary. Closure does
  not lift blocks. Authorized clearance and fresh receiving are now available as a
  separate versioned workflow (RECALL-CLEARANCE.md); package blocks remain. No physical
  recovery or notification is inferred.
- **Boundary:** Only original source instruments receive instrument blocks; mixed
  packages remain held as a whole, without silently releasing other members. Legacy
  cases keep their saved scope until explicitly extended. All scope remains within
  the authenticated tenant/facility. Oversized impact is rejected, not truncated.
- **Remaining scope:** Operational/clinical validation, historical-target recovery
  reconciliation, approved contamination/separation and clearance policies, partial
  returns, cross-facility propagation, real notification/recovery coordination and
  scalable recall jobs. No production acceptance is claimed by the fictional check.
- **Acceptance evidence:** Multi-generation, scope, persistent blocks, overlap,
  rollback and race checks are automated; browser ancestor/descendant save and stale
  label invalidation passed. Owner U-LINEAGE-01 passed November 5; broader manual acceptance remains
  pending in TESTING-REGISTER.md. See [RECALL-LINEAGE.md](RECALL-LINEAGE.md).

## RSP-ISS-005 — Production clearance, corrections and exception policies

- **Status:** Partial preview delivered; operational/production policies pending.
- **Delivered:** Closed cases with reviewed reprocessing dispositions can receive an
  explicit reviewer clearance. Operator admission previews full custody/processing
  groups, rejects unresolved recalls and running cleaning/cycles, creates fresh
  receiving holds and keeps old package/label blocks. Overlapping cleared restrictions
  can share the same admission. Superseded evidence and earlier case versions remain.
- **Remaining scope:** Verified person/competency policy, clinical clearance evidence,
  physical recovery/reconciliation, quarantine/discard corrections and repaired items,
  partial-instrument clearance, admission batches above 100 instruments, cross-site
  coordination and operational acceptance. Historical links must be reconciled when
  later incidents supersede receiving episodes. No arbitrary unblock/restock is supplied.
- **Validation:** Scoped domain/SQLite/HTTP/web checks cover permissions, scope, gates,
  overlap, concurrency, audit rollback and fresh proof. Owner U-CLEAR-01 and receiving U-CLEAR-02 passed November 5; broader
  manual checks remain pending. See [RECALL-CLEARANCE.md](RECALL-CLEARANCE.md).

## RSP-ISS-006 — Maintenance exceptions and production service policy

- **Status:** Initial maintenance/repair preview delivered; broader policy pending.
- **Delivered:** Defect/quarantine hold for unassigned instruments outside active
  processing; immutable assessment/repair evidence and actor history; dedicated reviewer
  authorization creates fresh receiving/processing hold with no inherited inspection.
  Current recall restrictions remain independent. Traceability includes hold and evidence.
- **Deferred:** Defect reporting against active trays, issued/loaded packages or active
  processing; incident-driven custody reconciliation (including recalls newly recorded
  during maintenance, which remain held); failed/unrepairable repair and
  authorized retirement/disposal; evidence correction/amendment; production person and
  competency checks; service-provider connections, scheduling, costs, preventive and
  predictive maintenance; history beyond 100 maintenance records per instrument.
- **Validation:** 234 scoped tests, builds and targeted developer browser walkthrough
  passed. U-MAINT-01 and broader manual/clinical acceptance remain pending. Independent
  cleaner/inspector separation remains separately parked under RSP-ISS-001.
  See [MAINTENANCE-REPAIR.md](MAINTENANCE-REPAIR.md).

## RSP-ISS-007 — Physical identification and operational scanning

- **Status:** Initial internal Data Matrix label/lookup preview delivered.
- **Delivered:** Stable UUID-derived RSP-I instrument identifier separate from serial;
  local vector label with identity-only warning; focused keyboard/Enter and simulated
  exact lookup fetching current scoped record and holds; read-only auditor access.
- **Deferred:** Physical 2D scanner settings/focus and Windows acceptance; print scale,
  dimensions, quiet-zone/contrast and label media durability; validated direct part
  marking and suitable DPM imagers; manufacturer UDI/GS1 parsing, AIM prefixes, camera
  scanning, cross-site identity/import policies and scan-assisted operational actions.
  Printed identity never bypasses current holds or constitutes release evidence.
- **Validation:** Scoped tests/builds and independent Data Matrix decoding; owner
  U-SCAN-01 and broader physical/manual acceptance pending. See
  [INSTRUMENT-SCANNING.md](INSTRUMENT-SCANNING.md).

### RSP-ISS-007 update — draft tray addition

Confirmed operator scan-to-draft now saves a single eligible member with frozen-type/
quantity, duplicate, current-hold and assignment gates; reservation/history/audit/receipt
are atomic. Normal completion remains separately confirmed. Developer 252 scoped tests,
builds and targeted browser checks passed; owner U-TRAYSCAN-01 remains pending. Physical
scanner/printer/DPM and receiving, packaging, loading and distribution scan actions remain
future work. See [TRAY-SCANNING.md](TRAY-SCANNING.md).

### RSP-ISS-007 update — scanned receiving

Receiving now stages internal identifiers in the form, rejects duplicates/current holds,
resets confirmation when membership changes and saves only after explicit final receipt
confirmation. The scanned save rechecks all member custody/recall gates atomically,
creates fresh processing holds and retains identifier provenance through cleaning and
inspection. Enter in the scanner field cannot submit the receipt. Developer 260 scoped
tests, builds and targeted browser checks passed; owner U-RECSCAN-01 and physical/exception/
full operational acceptance remain pending. Packaging, loading and distribution scan
actions, DPM/UDI/GS1 and physical hardware validation remain future work. See
[RECEIVING-SCANNING.md](RECEIVING-SCANNING.md).

### RSP-ISS-007 update — package identity and draft-load scanning

Preparation labels now contain a version-bound internal package Data Matrix generated
locally using the shared encoder. Confirmed scan additions atomically reserve one eligible
package in a current draft load, rechecking lifecycle, active package/load assignments,
returns, recalls and version consistency. Separate cycle-start/release controls remain.
Developer 269 scoped tests/builds and actual symbol decode/print/add/duplicate/Enter browser
checks passed. Owner U-LOADSCAN-01 and physical/exception/full operational acceptance
remain pending. Print media/DPM, manufacturer UDI/GS1/camera, release-label enhancements,
distribution and return scanning remain future work. See
[PACKAGE-LOAD-SCANNING.md](PACKAGE-LOAD-SCANNING.md).

### RSP-ISS-007 update — storage and distribution scanning

Read-only package scan lookup now validates current release/load/package versions and
recall/return/issued restrictions, opens a new storage form or the existing stored record,
and uses the existing separately confirmed transfer/issue controls. Write-time release
and custody revalidation remains authoritative; lookup records no movement. Developer
275 scoped tests/builds and storage-confirmation/location/existing-record-rescan browser
checks passed. Owner U-STORESCAN-01, transfer/issue exceptions, physical hardware and
handover, production identity and operational acceptance remain pending. DPM/UDI/GS1,
camera and return scanning remain future work. See [STORAGE-SCANNING.md](STORAGE-SCANNING.md).

### RSP-ISS-007 update — issued-package return scanning

Read-only return scan lookup now retrieves current version-bound package identity,
original issued source and original contents. Confirmed complete scanned returns freeze
identifier/manifest and preserve issue history; duplicate returns and mismatched contents
are refused. Recalled packages can return without lifting recall or reprocessing gates.
Developer scoped tests/builds cover lookup/receipt/gates and atomic persistence. Owner
U-RETSCAN-01 passed November 6, 2026; broader manual/physical acceptance remains pending. See
[RETURN-SCANNING.md](RETURN-SCANNING.md).

## RSP-ISS-008 — Persistent partial and mismatched return reconciliation

- **Status:** Expected-member shortages and later receipt implemented in the local
  preview November 6, 2026; owner U-PARTRETURN-01 passed November 6, 2026.
- **Delivered:** Original manifest/issue retained; explicit actual received subset;
  derived missing set; saved blocked discrepancy; all reservations retained; operator
  later receipts with actor/time/location/reference and immutable versions. Once fully
  accounted, separate reviewer disposition remains required. No partial reprocessing or
  automatic restock. Recall admission rejects unresolved discrepancies.
- **Remaining work:** Unexpected instruments/mismatched identity custody, incorrect
  receipt corrections, permanently missing/discard policies, partial-member processing,
  physical reconciliation, verified identity/competency and clinical/production acceptance.
- **Testing:** 303 scoped tests/builds and targeted browser checks passed. Owner initial
  shortage U-PARTRETURN-01 passed November 6, 2026; M-PARTRETURN-01–02 broader checks deferred. See
  [PARTIAL-RETURNS.md](PARTIAL-RETURNS.md). RSP-ISS-001 stays parked.

## RSP-ISS-009 — Production dashboard scale and operational acceptance

Delivered November 6: scoped 12-row Previous/Next paging, per-card snapshot times and
explicit fictional owner-check setup. U-DASHPAGE-01 Next passed November 6, 2026; owner Previous check unconfirmed; automated and browser checks
passed. Deferred: representative facility query/index performance, cross-page snapshot consistency,
real-time refresh requirements, priority/SLA definitions and production role/workspace
acceptance. Current queues are manually refreshed read-only snapshots; they do not
replace live workflow gates. U-DASH-01 passed November 6, 2026; M-DASH-01 tracks deferred broader checks.

Owner evidence November 6, 2026: “it shows different codes” confirms Next/page-two
record changes. Previous remains developer-verified only and is deferred with
M-DASHPAGE-01; no owner pass is inferred for that control or broader testing.

Owner screenshot November 6, 2026 confirms Return record saved, Return discrepancy —
blocked, Received instruments: 0, Missing instruments: 1, saved discrepancy reason,
original issued contents/identifier and no Record disposition action. U-PARTRETURN-01
passed. Later receipt, disposition and broader M-PARTRETURN-01–02 remain deferred.

## RSP-ISS-010 — Service counters and production maintenance policies

Initial recorded-cycle service thresholds delivered November 6, 2026. Counts start with
newly recorded finished loads; all outcomes count once. Separate versioned policies and
service baselines preserve instrument identity/evidence. Due holds block new assembly/
packaging; existing loads remain under normal review gates. Only reviewed repair return
authorization resets the baseline while retaining the total and requiring fresh processing.

Deferred: approved manufacturer/calendar/lifetime policies, historical imports/backfill,
verified equipment counters, per-component service, predictive maintenance, active-custody
repair (RSP-ISS-006), production identity/competency and operational acceptance. Developer
310 tests/build/browser checks; owner U-SERVICE-01 passed November 7, 2026, M-SERVICE-01–02 deferred.
See [SERVICE-THRESHOLDS.md](SERVICE-THRESHOLDS.md). RSP-ISS-001 remains parked.

Owner screenshot November 7, 2026 confirms recorded cycles 1, service interval 1,
remaining 0 and **Service due — new assembly and packaging blocked**. U-SERVICE-01
passed for the displayed fictional threshold example. Manual membership denial, policy
changes, repair/reset and broader M-SERVICE-01–02 remain deferred; developer tests do
not imply owner acceptance of those paths. RSP-ISS-001 remains parked.

## RSP-ISS-011 — Loaner readmission, exceptions and supplier policies

Initial complete-set receiving and separately confirmed supplier hand-back delivered
November 7, 2026. Supplier ownership is distinct from hosting facility; receipt creates
new identities and fresh processing holds atomically. Hand-back requires accounted original
contents, passed current inspection and reconciled custody/holds. Returned supplier-owned
items cannot silently re-enter local processing/assembly; receipt and hand-back history remain.

Delivered November 8: explicit complete-set repeat-visit readmission preserves identities,
supplier and service limits, creates fresh receiving holds, and retains earlier visits.
U-LOANREADMIT-01 passed November 8, 2026; 325 scoped tests/build/browser checks passed. See
[LOANER-READMISSION.md](LOANER-READMISSION.md). U-LOANER-01 remains unconfirmed.

Deferred: changed/partial later-visit shipments, duplicate serial/
manufacturer identity policy, partial or unexpected arrival/hand-back, corrections, verified
vendor master/contracts/IFU, acknowledgements, transport/cross-site work, calendar alerts and
production competency/operational acceptance. No supplier notifications or physical receipt
verification are performed. Developer 319 tests/build/browser checks; owner U-LOANER-01
pending, M-LOANER-01–02 deferred. See [LOANERS.md](LOANERS.md). RSP-ISS-001 remains parked.

Owner screenshot November 8, 2026 confirms Loaner record saved, Received — with
facility, Visit 2, DEMO-SUPPLIER, one expected original-code instrument, readmission
arrival details and a linked receiving episode. U-LOANREADMIT-01 passed for this saved
repeat-visit example. Broader M-LOANREADMIT-01–02 remain deferred. Original U-LOANER-01
remains unconfirmed; no retrospective pass is inferred. RSP-ISS-001 stays parked.
