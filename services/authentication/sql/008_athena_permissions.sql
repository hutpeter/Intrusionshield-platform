/* Explicit forward migration: permission definitions only. No accounts, client
   roles or assignments are created. Reviewed application database only. */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'Identity.Permissions',N'U') IS NULL THROW 50000,'Authorization foundation required.',1;
 IF NOT EXISTS(SELECT 1 FROM [Identity].[Permissions] WITH(UPDLOCK,HOLDLOCK) WHERE Resource=N'athena' AND Action=N'READ' AND Scope=N'TENANT')
 INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope) VALUES(NEWID(),N'View Athena records for own client',N'athena',N'READ',N'TENANT');
 IF NOT EXISTS(SELECT 1 FROM [Identity].[Permissions] WITH(UPDLOCK,HOLDLOCK) WHERE Resource=N'athena' AND Action=N'WRITE' AND Scope=N'TENANT')
 INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope) VALUES(NEWID(),N'Create and edit Athena records for own client',N'athena',N'WRITE',N'TENANT');
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
