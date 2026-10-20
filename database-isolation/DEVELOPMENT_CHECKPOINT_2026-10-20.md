# Database isolation — development checkpoint (2026-10-20)

## Decision
**PAUSED — DEVELOPMENT VALIDATED; NOT APPROVED FOR PRODUCTION CUTOVER.**
Resume feature development without altering existing runtime credentials or databases.

## Evidence completed
- Role-based database configuration with backward-compatible DB_* fallback; Athena and split Telemetry/Energy physical isolation demonstrated.
- Clean-room migrations: 21/21 executed on three fresh rehearsal databases. Smoke/rehearsal schema comparison 15/15 matched. Final catalog audit: 37 tables, 388 columns, 37 PKs, 97 indexes, 36 FKs and 63 CHECK constraints.
- Guarded API regression: tenant/site validation and persistence checks passed; existing energy table row counts preserved.
- Full COPY_ONLY CHECKSUM backups of three smoke databases, RESTORE VERIFYONLY, separate recovery restores, DBCC CHECKDB and table-count comparisons passed.
- Rehearsal-only SQL logins ruby_platform_test_svc, ruby_telemetry_test_svc, ruby_basems_test_svc created and enabled. Assigned-database connections passed; sampled unauthorized database connections denied. CREATE TABLE, ALTER ANY SCHEMA, db_owner and db_ddladmin checks all returned 0.
- A Platform test credential was disclosed during manual testing and was subsequently rotated by the operator. No secrets belong in repository or reports.

## Important boundaries
- The three restricted test accounts are **not yet validated against running Ruby API read/write regressions**. Schema-level DML grants have not been exhaustively exercised.
- Cross-database denial coverage is sampled, not exhaustive.
- Current live local services still use the existing development credentials; the SQL account hut6dev retains broad server roles. No production least-privilege claim.
- Historical smoke database migrations are not retroactively recorded as executed. Migration history baselining remains deferred.
- Backup/recovery checks are local rehearsal, not production RTO/RPO or point-in-time recovery certification.
- SQL session visibility investigation remains unresolved; direct sqlcmd connections proved instance, credentials and database reachability, not attribution of Ruby processes.
- No live deployment or production cutover is authorized.

## Production release gates — deferred
1. Run restricted-identity service startup and complete authenticated API read/write and tenant isolation regression against disposable databases.
2. Test all cross-database denial pairs, schema DML, stored procedure/sequence permissions and negative DDL.
3. Provision production-grade secrets and identities (runtime separate from migration); confirm TLS and secret rotation.
4. Establish migration history governance, deployment order, rollback/runbook, recovery objectives and monitoring.
5. Complete platform Administration/Onboarding Portal and security review before external go-live.

## Preserve
Branch: feature/database-isolation-foundation.
Do not delete Ruby_Isolation_Smoke_*, Ruby_Isolation_Rehearsal_*, Ruby_Isolation_Recovery_* or original intrusionshield databases as part of this checkpoint.
Keep verified backup files and earlier development backup checkpoints.
