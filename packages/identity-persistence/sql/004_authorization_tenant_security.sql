/*
 * Extend SQL Server RLS to tenant-specific authorization roles.
 * Platform-wide roles are intentionally readable across tenants, but tenant
 * roles must not be visible or writable outside their own tenant context.
 * Writes to platform roles require a separate privileged provisioning path.
 */
IF OBJECT_ID(N'Identity.fn_role_tenant_access', N'IF') IS NULL
    EXEC(N'CREATE FUNCTION [Identity].[fn_role_tenant_access](@TenantId uniqueidentifier)
        RETURNS TABLE WITH SCHEMABINDING AS
        RETURN SELECT 1 AS access_granted
        WHERE @TenantId IS NULL
           OR @TenantId = TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N''ruby.tenant_id''))');
GO
IF OBJECT_ID(N'Identity.fn_role_tenant_write', N'IF') IS NULL
    EXEC(N'CREATE FUNCTION [Identity].[fn_role_tenant_write](@TenantId uniqueidentifier)
        RETURNS TABLE WITH SCHEMABINDING AS
        RETURN SELECT 1 AS access_granted
        WHERE @TenantId IS NOT NULL
          AND @TenantId = TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N''ruby.tenant_id''))');
GO
IF NOT EXISTS (
    SELECT 1 FROM sys.security_predicates
    WHERE object_id = OBJECT_ID(N'Identity.IdentityTenantPolicy')
      AND target_object_id = OBJECT_ID(N'Identity.Roles')
)
BEGIN
    ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy]
        ADD FILTER PREDICATE [Identity].[fn_role_tenant_access](TenantId) ON [Identity].[Roles],
        ADD BLOCK PREDICATE [Identity].[fn_role_tenant_write](TenantId) ON [Identity].[Roles] AFTER INSERT,
        ADD BLOCK PREDICATE [Identity].[fn_role_tenant_write](TenantId) ON [Identity].[Roles] AFTER UPDATE;
END;
GO
