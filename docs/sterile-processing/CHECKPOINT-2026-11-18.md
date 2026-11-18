# Tiger checkpoint — November 18, 2026

Status: this owner-guided fictional-data acceptance round is complete. Tiger
development and further testing are on hold at the owner's request, pending a
business-priority reassessment. Do not expand the testing round or resume feature
work without a new instruction. The Cajamarca tender opportunity is uncertain;
the owner intends to prioritize more profitable opportunities.

## Observed acceptance

The owner ran the local HTTPS account runtime at localhost:9554 against the
existing local stores and supplied screenshots/results. These are owner-side
observations, not developer access to or tests against the owner's database.

- VERIFY-INS-001 was received in VERIFY-REC-001, manually cleaned and inspected
  under distinct operator and reviewer test identities. Receipt version 4 showed
  ready for assembly.
- VERIFY-TRAY-001 revision 1 requires one fictional verification instrument.
  VERIFY-ASM-001 accepted the full Ruby RSP-I scan identifier, matched composition
  and completed at version 3.
- VERIFY-PKG-001 version 1 preserved the assembly, procedure, consumable snapshot,
  package integrity confirmations and time-based shelf-life reference. Its saved
  expiry is 2026-11-25T13:20:00.000Z. Packaging alone showed not sterile.
- VERIFY-WRAP-002 has recorded expiry November 30, 2026 (not the originally
  suggested 2027). Ten individual items were received; packaging recorded use of
  one. VERIFY-WRAP-001 was mistakenly registered with November 17, 2026 expiry and
  retained as test history. No later balance check is claimed.
- VERIFY-STER-001 was registered as a fictional in-service steam sterilizer.
  The saved load snapshot shows service and qualification due November 30, 2027.
- VERIFY-LOAD-001 preserved the equipment revision and one package, recorded
  TEST-MACHINE-CYCLE-001 start, then a passed documented result with test cycle and
  indicator evidence. Version 3 remained awaiting review rather than released.
- The separate reviewer recorded the demonstration release decision with
  TEST-REVIEW-001. Storage then issue to TEST-DEPARTMENT-A / Fictional test
  recipient succeeded; distribution version 2 retained both movements and source
  traceability.
- Instrument traceability initially showed 8 linked records and 16 events. The
  owner confirmed CSV export worked; file contents were not independently reviewed.
- VERIFY-RETURN-001 recorded Used condition, all instruments received and original
  issue history. Reviewer disposition authorized a new cleaning episode at return
  version 2 while keeping the original package blocked.
- TEST-EC-001 is the new receiving episode: version 1, Received, containing
  VERIFY-INS-001, no cleaning attempts, with original return/package links. No
  second cleaning cycle was performed.
- The original distribution screen showed Returned — unavailable and no Record
  issue action. This is a UI reissue-block observation, not a direct HTTP denial
  test against the owner's runtime.
- Reviewer created the load-scoped fictional VERIFY-RECALL-001 after previewing
  impact on VERIFY-PKG-001 and VERIFY-INS-001.

## Final preserved state

The November 18 screenshot of VERIFY-INS-001 traceability shows 11 linked records
and 21 events. Current holds and blocks are:

- Instrument recall block: VERIFY-INS-001 → VERIFY-RECALL-001.
- Processing hold: VERIFY-INS-001 → TEST-EC-001.
- Package recall block: VERIFY-PKG-001 → VERIFY-RECALL-001.
- Return block: VERIFY-PKG-001 → VERIFY-RETURN-001.

The original receipt remains ready for assembly, version 4. The historical assembly
now shows Disassembled, version 4, following return disposition. The original
package record remains Packaged, version 1; its independent custody, return and
recall blocks determine availability. Leave the recall open and holds intact.

## Fix and local runtime notes

Commit 02bb291 corrected equipment-management UI visibility: the browser session
exposes equipment:write independently of release-review authority. Service/web
builds and 19 focused tests passed. Owner subsequently opened the registration
form, registered equipment and created/started the load successfully.

The previous Tiger process occupied port 9554 and required owner administrator
termination. A later restart failed because the normal PowerShell window lacked
NODE_EXTRA_CA_CERTS. Setting it to the existing local SQL certificate PEM restored
startup. Configuration/TLS format checks had passed, port 9554 was free and SQL
TCP 1433 reachable. Do not disable certificate validation.

Operator grants were explicitly expanded for this local verification to include
tray, packaging, consumable, equipment, cycle, distribution and return writes.
Reviewer grants were expanded with release:write, returns:dispose and recall:write.
Changes used existing saved grants, current versions and administrator attribution;
no implicit platform-superuser bypass was introduced. Live grant snapshots remain
authoritative; do not infer current versions from this document. Credentials and
private grant-change files stay outside the repository.

## Deferred, not accepted by this round

Recall recovery, disposition, closure, clearance/readmission; completion of the
second processing cycle; missing-item returns; failed/aborted cycle paths; broader
negative, concurrency, isolation and recovery testing on the owner's environment;
production deployment and clinical validation remain outside this acceptance.
Displayed persistent recall blocks were verified; a post-recall attempted write
was not performed. No physical processing, notifications or clinical release is
established by these fictional records. No owner-local backup was taken by the
developer, and stopping Tiger is an owner-side action, not an effect of this file.
