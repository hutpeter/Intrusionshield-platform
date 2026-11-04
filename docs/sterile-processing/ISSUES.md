# Ruby Sterile Processing — issues log

Updated November 4, 2026. Deferred requirements are recorded here so development
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
- **Remaining scope:** Partial returns/missing instruments, explicit use/procedure
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

- **Status:** Deferred; required before production recall acceptance.
- **Current behavior:** Return records and receiving episodes retain bidirectional
  source identifiers. A recall blocks its targeted package/load; a recalled package
  cannot enter the current reprocessing shortcut. A later recall against an older
  package does not automatically block descendant episodes/packages already created.
- **Remaining scope:** Traverse instrument and package lineage across processing
  episodes, define affected descendants, preserve independent historical case scope,
  invalidate downstream availability/labels and coordinate recovery without silently
  releasing unrelated instruments or closing earlier cases.
- **Acceptance checks:** Recall an ancestor after new cleaning/inspection, packaging,
  release and issue; verify all affected descendants are identified and blocked,
  tenant/facility boundaries hold and overlapping cases remain independent. Define
  partial-return, shared-tray and physical recovery policies before clinical use.
