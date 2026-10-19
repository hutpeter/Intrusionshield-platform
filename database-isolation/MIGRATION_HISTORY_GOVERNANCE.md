# Ruby isolated database migration-history governance — Foundation 7A

**Decision (2026-10-19): DEFER retrospective history baselining; do not manufacture migration execution provenance.**
**Status:** Development/test evidence accepted; production deployment NOT authorized.
**Scope:** PLATFORM_ISOLATED, TELEMETRY_ISOLATED, BAS_EMS_ISOLATED. Athena uses a separately guarded runner and is not covered by this decision.

## Verified evidence
- The three existing `Ruby_Isolation_Smoke_*` databases contain 19 Platform, 6 Telemetry and 12 BAS/EMS tables. Their `dbo.RubySchemaMigrations` tables were absent at the last assessment.
- The clean-room `Ruby_Isolation_Rehearsal_*` databases were created empty and all 21 sources (6 Platform, 5 Telemetry, 10 BAS/EMS) executed successfully.
- Fifteen schema catalog categories matched exactly across smoke/rehearsal pairs (tables, columns, indexes, FK mappings and CHECK constraints).
- The final structural audit passed (37 tables, 388 columns, 37 primary keys, 97 indexes, 36 FKs, 63 CHECK constraints); guarded API regression and cleanup passed.
- The four Platform foundation SQL sources are NOT part of the `PLATFORM_ISOLATED` regional migration manifest; any future unified runner must include them explicitly and unambiguously.
- No clean-room history entries were written. Successful manual execution is **not** evidence that the current migration runner applied a file.

## Policy
1. **Never insert retrospective `APPLIED` history entries** into populated smoke databases merely because their catalog matches the source. Do not claim migration-runner execution that did not occur.
2. **Preserve evidence:** retain source commit, SHA-256 source hashes, database identity, schema fingerprints, console logs, UTC test timestamps, operator and any exceptions. Treat schema fingerprints as structural evidence, not data/content equivalence.
3. **New empty environments:** introduce a separately reviewed isolated-role migration runner with a deterministic ordered manifest, explicit database allowlist, atomic history writes after each successful migration, checksums, and fail-closed behavior. Require fresh backup and rollback policy before using it beyond disposable rehearsal.
4. **Already-populated environments:** any future baseline is a **distinct administrative attestation**, not an ordinary applied migration. Require documented operator approval, independent source/catalog review, data parity checks, tested backup/restore, and a design that distinguishes `BASELINED` from `EXECUTED` in audit records. Do not repurpose existing history schema without reviewing Athena compatibility.
5. **Schema evolution:** forbid applying an isolated migration to a populated database without verified history or approved baseline. Detect unknown, reordered, missing and checksum-mismatched migrations; never auto-reconcile.
6. **Isolation:** keep `intrusionshield`, `Ruby_Athena_Isolation_Test`, `Ruby_Athena_Restore_Verification`, all smoke DBs and all rehearsal DBs out of any default execution target.
7. **Operational controls:** no service cutover, data migration, DROP, restore, baseline write, or production deployment is approved by this document.

## Remaining gates (ordered)
- [x] Verify 21 sources execute on clean empty disposable databases.
- [x] Compare rebuilt schemas with existing disposable smoke schemas (15/15 exact metadata categories).
- [x] Complete structural audit and guarded tenant-aware API regression.
- [ ] Design and review isolated migration history representation, including `BASELINED` vs `EXECUTED`, identity, checksum, provenance and audit metadata.
- [ ] Implement and test fail-closed migration runner on **new disposable databases only**.
- [ ] Perform current COPY_ONLY backups and `RESTORE VERIFYONLY` for each role database, plus isolated restore/DBCC checks.
- [ ] Validate service least-privilege credentials, secret management, observability, startup and deployment order.
- [ ] Rehearse rollback and recovery for a deliberately failed migration; document RPO/RTO and data reconciliation.
- [ ] Explicitly approve production migration/data movement and cutover separately.

## Read-only operator checks
Use the existing SQL credential environment (`RUBY_ISOLATION_SMOKE_SERVER`, `_PORT`, `_USER`, `_PASSWORD`) in PowerShell:

```powershell
node database-isolation/assess-baseline-eligibility.mjs --assess
node database-isolation/compare-clean-room-schemas.mjs --compare
node database-isolation/audit-schema-definitions.mjs --check
```

All three commands are read-only. **Do not** run `migrate.mjs --apply`, `rehearse-clean-room.mjs --execute`, or any history-table INSERT/UPDATE against existing populated databases. The rehearsal executor refuses populated targets by design.

## Sign-off
Engineering evidence: PASS for the tested disposable schema and API paths.
Migration-history provenance: OPEN / baseline deferred.
Backup and recovery for all isolated roles: OPEN.
Production readiness: NOT APPROVED.
