/*
 * Tenant-scoped authorization audit visibility.
 *
 * Tenant sessions may read and append only their own audit events. Records
 * with NULL TenantId are platform-level events and are not exposed to tenant
 * sessions. Platform audit ingestion requires a separately privileged path.
 *
 * Application principals must not have ALTER on the audit table or policies.
 */
IF NOT EXISTS (
    SELECT 1 FROM sys.security_predicates
    WHERE object_id = OBJECT_ID(N'Identity.IdentityTenantPolicy')
      AND target_object_id = OBJECT_ID(N'Identity.AuthorizationAudit')
)
BEGIN
    ALTER SECURITY POLICY [Identity].[IdentityTenantPolicy]
        ADD FILTER PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[AuthorizationAudit],
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[AuthorizationAudit] AFTER INSERT,
        ADD BLOCK PREDICATE [Identity].[fn_tenant_access](TenantId) ON [Identity].[AuthorizationAudit] AFTER UPDATE;
END;
GO
