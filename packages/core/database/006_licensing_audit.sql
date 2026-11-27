-- Forward-only migration. Validate in a disposable database before deployment.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
CREATE TABLE core.LicensingAuditEvents (
    id uniqueidentifier NOT NULL CONSTRAINT PK_LicensingAuditEvents PRIMARY KEY,
    actor_id uniqueidentifier NOT NULL,
    actor_tenant_id uniqueidentifier NOT NULL,
    target_tenant_id uniqueidentifier NOT NULL,
    operation nvarchar(40) NOT NULL,
    subject_id uniqueidentifier NOT NULL,
    correlation_id uniqueidentifier NOT NULL,
    occurred_at datetime2(7) NOT NULL CONSTRAINT DF_LicensingAuditEvents_Time DEFAULT SYSUTCDATETIME(),
    details_json nvarchar(max) NOT NULL,
    CONSTRAINT CK_LicensingAuditEvents_Operation CHECK (operation IN (N'create-license',N'change-status',N'assign-entitlement',N'revoke-entitlement')),
    CONSTRAINT CK_LicensingAuditEvents_Details CHECK (ISJSON(details_json)=1)
);
CREATE INDEX IX_LicensingAuditEvents_TenantTime ON core.LicensingAuditEvents(target_tenant_id,occurred_at,id);
COMMIT TRANSACTION;
