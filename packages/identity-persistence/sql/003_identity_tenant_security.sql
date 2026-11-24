/*
 * SQL Server identity tenant isolation.
 * Apply with a privileged migration principal. Application connections must
 * never have ALTER ANY SECURITY POLICY, ALTER on this schema, or db_owner.
 * The session tenant ID is transaction-scoped by SqlServerProvider.
 */
IF OBJECT_ID(N'Identity.fn_tenant_access', N'IF') IS NULL
    EXEC(N'CREATE FUNCTION [Identity].[fn_tenant_access](@TenantId uniqueidentifier)
        RETURNS TABLE WITH SCHEMABINDING AS
        RETURN SELECT 1 AS access_granted
        WHERE @TenantId = TRY_CONVERT(uniqueidentifier, SESSION_CONTEXT(N''ruby.tenant_id''))');
GO

IF NOT EXISTS (SELECT 1 FROM sys.security_policies WHERE name = N'IdentityTenantPolicy' AND schema_id = SCHEMA_ID(N'Identity'))
BEGIN
    CREATE SECURITY POLICY [Identity].[IdentityTenantPolicy]
        ADD FILTER PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[Identities],
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[Identities] AFTER INSERT,
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[Identities] AFTER UPDATE,
        ADD FILTER PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[Users],
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[Users] AFTER INSERT,
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[Users] AFTER UPDATE,
        ADD FILTER PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[ServiceIdentities],
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[ServiceIdentities] AFTER INSERT,
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[ServiceIdentities] AFTER UPDATE,
        ADD FILTER PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[IdentityRoles],
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[IdentityRoles] AFTER INSERT,
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[IdentityRoles] AFTER UPDATE,
        ADD FILTER PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[PlatformRoleAssignments],
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[PlatformRoleAssignments] AFTER INSERT,
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[PlatformRoleAssignments] AFTER UPDATE
    WITH (STATE = ON);
END;
GO
