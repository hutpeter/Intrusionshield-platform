/*
 * Match PostgreSQL's privileged-only PlatformRoleAssignments write policy.
 * Tenant-scoped sessions may read their own assignments but must never grant
 * or alter platform privileges, even for identities in the same tenant.
 * Privileged provisioning uses a separate administrative execution context.
 */
IF OBJECT_ID(N'Identity.fn_deny_platform_assignment_write', N'IF') IS NULL
    EXEC(N'CREATE FUNCTION [Identity].[fn_deny_platform_assignment_write](@TenantId uniqueidentifier)
        RETURNS TABLE WITH SCHEMABINDING AS
        RETURN SELECT 1 AS access_granted WHERE 1 = 0');
GO
IF EXISTS (
    SELECT 1 FROM sys.security_predicates
    WHERE object_id = OBJECT_ID(N'Identity.IdentityTenantPolicy')
      AND target_object_id = OBJECT_ID(N'Identity.PlatformRoleAssignments')
      AND operation_desc = N'AFTER INSERT'
)
BEGIN
    ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy]
        DROP BLOCK PREDICATE ON [Identity].[PlatformRoleAssignments] AFTER INSERT,
        DROP BLOCK PREDICATE ON [Identity].[PlatformRoleAssignments] AFTER UPDATE;
END;
GO
ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy]
    ADD BLOCK PREDICATE [Identity].[fn_deny_platform_assignment_write](TenantId) ON [Identity].[PlatformRoleAssignments] AFTER INSERT,
    ADD BLOCK PREDICATE [Identity].[fn_deny_platform_assignment_write](TenantId) ON [Identity].[PlatformRoleAssignments] AFTER UPDATE;
GO
