# Ruby Database Isolation - Development Checkpoint (2026-10-21)

## Decision

DEVELOPMENT VALIDATION CONTINUES.
NOT APPROVED FOR PRODUCTION CUTOVER.

This checkpoint supplements DEVELOPMENT_CHECKPOINT_2026-10-20.md.

## Validation completed

- Authentication service TypeScript build passed.
- Authentication test suite: 16 tests passed.
- Real HTTP and SQL tenant administration integration: 6 checks passed.
- SQL transaction rollback verified removal of temporary test records.
- Test database: Ruby_Isolation_Rehearsal_Platform.
- Restricted SQL account: ruby_platform_test_svc.
- CREATE TABLE permission: denied.
- ALTER ANY SCHEMA permission: denied.
- db_owner membership: absent.
- db_ddladmin membership: absent.
- Platform database connection: granted.
- Telemetry rehearsal database connection: rejected (ELOGIN).
- BAS/EMS rehearsal database connection: rejected (ELOGIN).

## Security finding

The restricted Platform account has direct schema-level
SELECT, INSERT, UPDATE and DELETE grants on:

- Authentication
- Identity
- EIS
- Platform

These grants are broader than the intended production
least-privilege model.

The account can potentially modify authorization configuration
and audit records through its SQL permissions.

No SQL permissions were changed during this validation.

## Required follow-up

1. Define separate runtime, provisioning and migration identities.
2. Establish object-level permissions for sensitive tables.
3. Protect authorization audit records against unauthorized modification.
4. Validate restricted-account provisioning and write operations.
5. Complete cross-database isolation testing for all service accounts.
6. Test stored procedures, sequences and negative DDL operations.
7. Complete the Ruby Administration/Onboarding Portal.
8. Perform production security review before deployment.

## Preservation requirements

- Preserve all original intrusionshield databases.
- Preserve Ruby_Isolation_Smoke_* databases.
- Preserve Ruby_Isolation_Rehearsal_* databases.
- Preserve Ruby_Isolation_Recovery_* databases.
- Preserve existing database backups.
- Do not change live service credentials.
- Do not modify the two Athena HIS ZIP exports.

## Status

Database isolation remains validated for development only.

Production cutover is not authorized.
