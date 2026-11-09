# Equipment incident impact assessment

## One owner check

**U-EQINC-01 passed November 9, 2026 (owner screenshot):** update and enter as **Demo reviewer** → **Processing equipment** → **Prepare fictional equipment incident example**. If a machine detail is open, use **Back to equipment** first. The setup opens a new fictional machine and an incident form with its affected UTC period and evidence references prefilled. Click **Preview affected work**, review **Affected processing records: 1** and **Directly linked packages: 1**, tick **I confirm this incident assessment. Recording it does not create package holds or recalls**, then **Record incident assessment**. Expect **Incident recorded — review required**, the saved scope and **Linked recalls: 0**. This is the only owner check requested. Do not create a recall for this check; that path is developer-tested.

The setup uses fictional service and processing evidence only. Reviewer machine registration and operator processing use their own actor-scoped transactions; retries reuse the derived fixture identities. The setup neither records the human incident assessment nor automatically creates a recall, release, notification or machine hold.

## Scope and coverage

A reviewer enters a canonical UTC start and end (start strictly before end; end cannot be in the future) and previews recorded work. A started cleaning attempt or cycle overlaps when it started strictly before the period end and either remains unfinished or finished at/after the period start. Including a finish exactly on the start boundary is conservative. Draft loads with no start are excluded; running, passed, failed and aborted work are included when they overlap. This is a recorded-data investigation, not a measurement of physical contamination or validated processing.

Sterilization uses the machine snapshot captured at start, falling back to a registered draft machine snapshot or an exact older sterilizer code only when no ID snapshot exists. Mechanical cleaning uses its attempt's machine snapshot or exact older machine code. Registered machine IDs take precedence over text; legacy matches are labeled explicitly and never rewritten as registered evidence. Code aliases, renamed machines, missing/incorrect manual links, unrecorded physical exposure, outcomes recorded after the preview and the chosen investigation period require human review. Equipment service/qualification decisions do not infer an incident period.

Load membership directly identifies package targets. Cleaning targets require the exact episode ID **and cleaning-attempt number** in each package's frozen inspection proof. A later successful cleaning attempt does not silently inherit the earlier attempt's package targets. Failed or unfinished/unpackaged work is still shown in the assessment, but no package recall can be created until a package source exists. Those instruments/workflows are not automatically held by recording an incident; staff must follow their incident/processing procedures. The UI makes this limitation explicit.

The preview contains a frozen machine revision, compact processing IDs/codes/versions, start/finish/outcome, registered-versus-legacy link classification, instrument/package references, direct package versions and recorded custody locations/destinations. It is bounded at 200 work exposures, 100 direct package candidates and 5,000 instrument/package references. Source queries stop with an extra sentinel row. Exceeding a bound returns INCIDENT_LIMIT rather than saving a partial assessment. Broad queries can be conservatively rejected before an exact attempt filter reduces package candidates; narrow the period or arrange a complete external investigation. No physical location tracking or recipient acknowledgments are performed.

## Recording and changes

Previewing is read-only. Recording requires a separate reviewer confirmation, incident code, reason and evidence reference. A fresh transactional preview must match the supplied impact hash. Changes to relevant work versions, equipment version, package versions or recorded custody since preview cause CONFLICT and require a fresh preview. Empty recorded scope is allowed, remains explicitly review-required and is not evidence that no exposure occurred.

Saved scope is immutable. Later machine service changes, package movements, cycle results and other work do not update it. There is no automatic retrospective expansion, incident closure, 'no impact' clinical clearance or bypass. A new assessment can investigate a corrected/expanded period; it does not erase the earlier record. Versions increment only when a linked recall is created; version 1 remains the original assessment.

## Explicit linked recalls

For each directly linked package the reviewer can **Preview recall for this package**. This uses the existing current recall impact logic, which can add later reprocessed packages and present instrument custody beyond the frozen incident scope. The reviewer sees every target and the count of instrument blocks, reviews a recall code/reason/reference and separately confirms **I confirm this recall, the affected packages and persistent instrument blocks** before **Create linked recall**.

The source must be a direct target of the saved incident. The current package and lineage/custody scope are rechecked against the recall preview hash. Equipment incident write permission and recall write permission are both required; a read-only preview is not authorization. The incident version is checked, and a package cannot receive the same incident's direct recall action twice. Existing overlapping recall cases remain governed by the existing recall rules.

The recall, package/instrument blocks, incident association, immutable incident revision, audit events and idempotency receipts commit in one transaction. Failure of the final incident audit rolls the entire action back. The recall carries the incident ID/code, machine ID/code and affected UTC period into its current and historical record. Recall detail and trace facts display this source. **Open recall case** opens the existing recovery/disposition/clearance workflow; no new recall-resolution shortcut is introduced. Stored and issued stock remains subject to current recall gates. Original machine/workflow/package/release evidence is retained; recording an incident never revokes or rewrites a historical release.

Taking the machine out of service remains a separate explicit equipment action. Recording an assessment, creating a recall or closing a recall does not physically stop equipment, contact recipients, physically quarantine/recover packages, validate new processing, restore old stock or release instruments for clinical use. RSP-ISS-001 independent inspector enforcement remains parked.

## Access, storage and API

Assessment reads/writes require their equipment-incidents permission plus equipment, processing, cycles, packaging, distribution, instruments and recall read permissions before repository access. Recall action additionally requires recall write. The preview grants recording/actions only to Demo reviewer; Demo operator and Demo auditor may read when source permissions allow. Existing scope concealment, strict bodies/queries, verified identity and preview origin/CSRF protection apply.

- GET `/equipment/:id/incident-impact?from=<UTC>&to=<UTC>`: read-only preview.
- GET `/equipment/:id/incidents?page=N`: 50-row machine incident history.
- POST `/equipment-incidents`: `{requestId,code,equipmentId,from,to,impactHash,reason,reference,confirmed}`.
- GET `/equipment-incidents/:id` and `/equipment-incidents/:id/versions/:version`.
- GET `/equipment-incidents/:id/recall-impact?packageId=<UUID>`.
- POST `/equipment-incidents/:id/recalls`: `{requestId,version,packageId,impactHash,code,reason,reference,confirmed}`.

The development SQLite adapter adds scoped `sp_equipment_incidents` and `sp_equipment_incident_versions`, with equipment FK, unique incident code and optimistic versions. Snapshot queries use scoped prepared SQL/JSON parameters. No existing equipment or work history is rewritten. There is no new trace root, dashboard queue, automated incident discovery or notification in this increment.

M-EQINC-01 deferred: broader owner period/source/legacy/washer/recall/issued-stock/recovery/history/language/mobile walkthrough. M-EQINC-02 deferred: verified clinical/IFU/incident policies and investigation completeness, machine aliases and unrecorded work, unpackage instrument incident holds, live scope extension/corrections/closure, production migrations/indexes/clock/scale, attachments/notifications/physical recovery and operational acceptance. RSP-ISS-001 remains parked.

Developer verification November 8, 2026: 360 scoped tests (195 domain, 127 HTTP/SQLite, 38 web), builds and targeted Chromium assessment/confirmation/no automatic block/separate recall/source navigation/refresh passed. U-EQINC-01 passed November 9, 2026: owner screenshot confirms Incident recorded — review required, affected processing records: 1, directly linked packages: 1, linked recalls: 0 and saved incident version 1. The screenshot verifies the fictional demonstration path only, not clinical or production acceptance.
