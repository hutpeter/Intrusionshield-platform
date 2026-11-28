-- Permission definitions only. No roles, accounts or assignments are granted.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'Identity.Permissions',N'U') IS NULL THROW 50000,'Authorization foundation required.',1;
 INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope)
 SELECT NEWID(),v.Name,N'platform.licensing',v.Action,N'PLATFORM'
 FROM (VALUES
 (N'View customer licensing',N'READ'),
 (N'Create customer license',N'CREATE_LICENSE'),
 (N'Change customer license status',N'CHANGE_STATUS'),
 (N'Assign customer entitlement',N'ASSIGN_ENTITLEMENT'),
 (N'Revoke customer entitlement',N'REVOKE_ENTITLEMENT')
 ) v(Name,Action)
 WHERE NOT EXISTS(SELECT 1 FROM [Identity].[Permissions] p WITH(UPDLOCK,HOLDLOCK)
 WHERE p.Resource=N'platform.licensing' AND p.Action=v.Action AND p.Scope=N'PLATFORM');
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
