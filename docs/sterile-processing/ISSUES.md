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

- **Status:** Planned/deferred after the initial manual review increment.
- **Current behavior:** Final recorded release/rejection decisions are immutable.
  Holds can receive later versioned decisions; original evidence is retained.
- **Remaining scope:** Define authorized correction, withdrawal/recall and
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
