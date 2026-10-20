/*
 Ruby Tenant Administration — disposable rehearsal database SQL integration smoke.
 SAFE DEFAULT: every test transaction is rolled back.
 Execute only against Ruby_Isolation_Rehearsal_Platform in SSMS.
 This tests SQL schema behavior, NOT the TypeScript repository or HTTP API.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'Ruby_Isolation_Rehearsal_Platform'
    THROW 51020, 'Wrong database: rehearsal Platform database required.', 1;
IF OBJECT_ID(N'Platform.Tenants', N'U') IS NULL
    THROW 51021, 'Platform.Tenants missing. Stop.', 1;
IF OBJECT_ID(N'EIS.TenantConfigurations', N'U') IS NULL
    THROW 51022, 'EIS.TenantConfigurations missing. Stop.', 1;
IF OBJECT_ID(N'Identity.AuthorizationAudit', N'U') IS NULL
    THROW 51023, 'Identity.AuthorizationAudit missing. Stop.', 1;

DECLARE @id uniqueidentifier = NEWID();
DECLARE @code nvarchar(80) = N'RUBY_SMOKE_' + REPLACE(CONVERT(nvarchar(36), @id), N'-', N'');
DECLARE @auditId bigint;
BEGIN TRY
    BEGIN TRANSACTION;
    INSERT INTO [Platform].[Tenants] (Id, Code, NormalizedCode, DisplayName, CountryCode)
    VALUES (@id, @code, UPPER(@code), N'Ruby SQL Integration Smoke', N'CA');

    INSERT INTO [EIS].[TenantConfigurations]
        (tenant_id, country_code, default_language, locale, time_zone, created_at, updated_at, version)
    VALUES (@id, N'CA', NULL, NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME(), 1);

    IF NOT EXISTS (SELECT 1 FROM [Platform].[Tenants] WHERE Id = @id)
        THROW 51024, 'Tenant insert not visible inside transaction.', 1;
    IF NOT EXISTS (SELECT 1 FROM [EIS].[TenantConfigurations] WHERE tenant_id = @id)
        THROW 51025, 'Tenant configuration insert not visible inside transaction.', 1;

    INSERT INTO [Identity].[AuthorizationAudit]
        (TenantId, IdentityId, Resource, Action, Allowed, Reason)
    VALUES (@id, NULL, N'platform.tenants', N'CREATE', 0, N'Rehearsal audit smoke - rollback');
    SET @auditId = SCOPE_IDENTITY();
    IF NOT EXISTS (SELECT 1 FROM [Identity].[AuthorizationAudit] WHERE Id = @auditId)
        THROW 51026, 'Audit insert not visible inside transaction.', 1;

    SELECT N'PASS: tenant + configuration + audit visible inside transaction' AS Result,
           @id AS SmokeTenantId, @code AS SmokeCode;
    ROLLBACK TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

IF EXISTS (SELECT 1 FROM [Platform].[Tenants] WHERE Id = @id)
    THROW 51027, 'Tenant unexpectedly persisted after rollback.', 1;
IF EXISTS (SELECT 1 FROM [EIS].[TenantConfigurations] WHERE tenant_id = @id)
    THROW 51028, 'Configuration unexpectedly persisted after rollback.', 1;
IF EXISTS (SELECT 1 FROM [Identity].[AuthorizationAudit] WHERE Id = @auditId)
    THROW 51029, 'Audit unexpectedly persisted after rollback.', 1;

SELECT N'PASS: tenant, configuration and audit all absent after rollback' AS Result;
SELECT DB_NAME() AS DatabaseName, N'NO TEST RECORDS COMMITTED' AS PersistenceStatus;
