# Registered processing equipment

## One owner check

**U-EQUIP-01 passed November 8, 2026:** owner screenshot confirms saved Version 1, current recorded dates and registration history. Original check: after updating the local preview, sign out and enter as **Demo reviewer**. Open **Processing equipment** → **Prepare fictional equipment example**. Review the prefilled fictional sterilizer and UTC service/qualification dates, tick **I confirm this equipment record and its documented service and qualification status**, then **Save equipment record**. Expect **In service — recorded dates current**, the machine's references/dates and **Equipment history**. The example only fills the form; it never registers or activates equipment before confirmation. This is the only owner check for this build. Demo operator cannot register or restore equipment.

## Identity and recorded policy

Facility-scoped equipment identities record immutable code, name, manufacturer/model, serial number, location, type (sterilizer or washer-disinfector) and declared sterilization methods. Sterilizers declare one or more of steam, low temperature or other; washers have no sterilization methods and can be selected for mechanical cleaning only. Machine codes remain unique within their tenant/facility and cannot be recycled or edited here. Broader identity correction/retirement/movement is deferred.

Each version records in-service/out-of-service status, last service instant, service due instant and evidence reference, qualification due instant and evidence reference, decision reason and actor. Dates must be canonical UTC ISO timestamps. Last service cannot be in the future; service due must follow it. In-service registration or restoration requires both service and qualification deadlines to be strictly in the future. At either due instant, new work is blocked. Out-of-service records can retain overdue evidence. No maintenance intervals or manufacturer deadlines are inferred, and no date is silently extended.

These are manually entered dates and references to approved local policy/evidence, not verified calibration, clinical qualification, competency, machine validation, automatic telemetry or authorization to use a real machine. The reviewer's explicit confirmation records the local decision. This increment does not implement independent inspector enforcement (RSP-ISS-001 remains parked).

## Roles and history

Equipment read permission permits list/current/historical versions and paged audit history. Equipment write permission controls registration and service/status decisions; in the local preview this belongs to Demo reviewer. Equipment hold permission lets Demo operator and Demo reviewer explicitly take an in-service machine out of service with a reason. Demo auditor is read-only. Operators cannot restore service or modify deadlines.

Every command is scoped, optimistic-versioned, idempotent and atomically audited. Historical equipment versions and workflow machine snapshots remain immutable. A new service decision creates a new equipment revision without rewriting the original identity, past cleaning attempts or load evidence. This is a foundation for later asset service/work-order capabilities; it does not introduce the Asset Management module or copy instrument repair records into machine history.

## Processing links

New UI mechanical-cleaning forms require a compatible registered washer-disinfector. New UI load forms require a compatible registered sterilizer. Selectors show out-of-service/overdue machines as unavailable and recheck on the server. The browser's cached selection is never authorization.

The optional API `equipmentId` must match the exact supplied machine code, type and method. Mechanical cleaning freezes the equipment revision used at start. A draft load captures its initial machine revision; starting it rechecks the current machine and freezes a separate `startedEquipment` snapshot. A reviewer may restore a machine after a draft was created; the original draft revision and the newer starting revision both remain recorded. A service/qualification deadline reached or an out-of-service decision after opening the form blocks start. Audit failure rolls back the workflow and snapshot together.

Manual cleaning does not accept an equipment ID. Its existing optional text reference is retained for compatibility. Older API clients and existing unlinked records may continue using unknown free-text machine references; these do not acquire fabricated machine identities. An exact known registered code is resolved and checked even when the caller omits its ID, preventing that omission from bypassing the machine's recorded block. Unknown free-text references remain a compatibility exception, not evidence of registered-equipment enforcement. Production mandatory-linking/legacy-remediation policy is deferred. Starting mechanical cleaning or creating/starting a load additionally requires equipment read permission before equipment/workflow data can be queried.

A machine going out of service or becoming due does not cancel running work, suppress outcome evidence, revoke historical release, start a recall, quarantine packages or physically stop equipment. Running outcomes can still be recorded. Impact assessment, qualification failures, linked-load recall, maintenance work orders and site incident policy need a later workflow. Finished load review/distribution still applies existing package/review/recall checks; no retroactive machine eligibility rule is inferred.

## Evidence, storage and API

Processing/load current and historical displays show the saved equipment revision. Traceability facts preserve the selected identity, equipment version, recorded status and service/qualification dates/references at draft creation and start. Equipment has its own library/history; no new standalone equipment trace-root type is introduced.

The local SQLite adapter adds scoped `sp_equipment` and `sp_equipment_versions` tables. Old workflow payloads are not rewritten. Identity uniqueness, version conflicts, receipt retries and audit writes share the existing transaction. This remains a development adapter; production migration/index/clock assurance is deferred.

- GET `/equipment?page=N`, `/equipment/:id`, `/equipment/:id/versions/:version`, `/equipment/:id/history?page=N`.
- POST `/equipment`: full identity, declared methods, service/qualification fields, reason and confirmation.
- POST `/equipment/:id/service`: expected version, state, service/qualification fields, reason and confirmation. Identity changes are rejected.
- POST `/equipment/:id/hold`: expected version, reason and confirmation. Requires current in-service state; restoration uses the reviewer service route.
- Optional `equipmentId` on POST `/processing/:id/start` and POST `/loads`.
- Ineligible machines return `EQUIPMENT_BLOCKED` (409), alongside existing scope, validation and optimistic conflict errors.

Lists/history page at 50 records. Selector acquisition stops explicitly after 1,000 machines rather than silently omitting further equipment. There is no equipment dashboard queue, scheduled notification or physical machine connection in this increment.

M-EQUIP-01 deferred: broader owner washer selection, methods/overdue/out-of-service, service restore, historical/trace, languages/mobile and exception walkthroughs. M-EQUIP-02 deferred: clinical/manufacturer/site qualification policy, competency, work orders, calibration attachments/telemetry, incident/recall consequences, production migrations/scale/clock/hardware and operational acceptance. RSP-ISS-001 remains parked.

Developer verification November 8, 2026: 352 scoped tests (191 domain, 124 HTTP/SQLite, 37 web), builds and targeted Chromium registration/confirmation/hold/restore, washer/load selectors, frozen revision, late-outage start denial and refresh checks passed. U-EQUIP-01 passed November 8, 2026 by owner screenshot; broader checks remain deferred.
