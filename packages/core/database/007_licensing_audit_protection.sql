-- Forward migration. This protects ordinary DML, not privileged DDL or database owners.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'core.LicensingAuditEvents',N'U') IS NULL THROW 50000,'Licensing audit schema required.',1;
 EXEC(N'CREATE TRIGGER core.TR_LicensingAuditEvents_Immutable
 ON core.LicensingAuditEvents
 AFTER UPDATE, DELETE
 AS
 BEGIN
 SET NOCOUNT ON;
 IF EXISTS (SELECT 1 FROM deleted)
 THROW 50001, ''Licensing audit events are immutable.'', 1;
 END');
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
