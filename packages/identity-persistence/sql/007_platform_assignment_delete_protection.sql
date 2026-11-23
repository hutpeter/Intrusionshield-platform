/*
 * Platform assignments cannot be revoked through tenant-scoped SQL.
 * AFTER INSERT/UPDATE write blocks were established by migration 006.
 * BEFORE DELETE blocks revocation of existing assignments; tenant sessions
 * retain read-only access to their own assignment records.
 *
 * Provisioning and revocation require a separate privileged maintenance
 * channel with explicit policy administration, not a tenant connection.
 */
IF NOT EXISTS (
    SELECT 1 FROM sys.security_predicates
    WHERE object_id = OBJECT_ID(N'Identity.IdentityTenantPolicy')
      AND target_object_id = OBJECT_ID(N'Identity.PlatformRoleAssignments')
      AND operation_desc = N'BEFORE DELETE'
)
BEGIN
    ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy]
        ADD BLOCK PREDICATE [Identity].[fn_deny_platform_assignment_write](TenantId)
        ON [Identity].[PlatformRoleAssignments] BEFORE DELETE;
END;
GO
