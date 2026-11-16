/* Forward-only account administration extension. Review/apply explicitly to the
   identity/platform database. Never run automatically at service startup.
   Existing Identity/RBAC tables and Platform.Tenants must already exist. */
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID(N'Identity.UserAdministration',N'U') IS NULL
 CREATE TABLE [Identity].[UserAdministration](
  TenantId uniqueidentifier NOT NULL, IdentityId uniqueidentifier NOT NULL,
  AccountType nvarchar(20) NOT NULL, PersonId uniqueidentifier NULL,
  Version int NOT NULL, SessionVersion int NOT NULL, RequiresSetup bit NOT NULL,
  FacilityIds nvarchar(max) NOT NULL, ProductKeys nvarchar(max) NOT NULL,
  CONSTRAINT PK_UserAdministration PRIMARY KEY(TenantId,IdentityId),
  CONSTRAINT FK_UserAdministration_Identity FOREIGN KEY(TenantId,IdentityId) REFERENCES [Identity].[Identities](TenantId,Id),
  CONSTRAINT CK_UserAdministration_Type CHECK(AccountType IN(N'USER',N'CLIENT_ADMIN',N'SUPERUSER')),
  CONSTRAINT CK_UserAdministration_Version CHECK(Version>0 AND SessionVersion>=0),
  CONSTRAINT CK_UserAdministration_Json CHECK(ISJSON(FacilityIds)=1 AND ISJSON(ProductKeys)=1)
 );
 IF OBJECT_ID(N'Authentication.AccountSetupTokens',N'U') IS NULL
 CREATE TABLE [Authentication].[AccountSetupTokens](
  TokenHash char(64) NOT NULL PRIMARY KEY, TenantId uniqueidentifier NOT NULL,
  IdentityId uniqueidentifier NOT NULL, ExpiresAt datetime2(7) NOT NULL, UsedAt datetime2(7) NULL,
  CONSTRAINT FK_AccountSetupTokens_Identity FOREIGN KEY(TenantId,IdentityId) REFERENCES [Identity].[Identities](TenantId,Id)
 );
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'Authentication.AccountSetupTokens') AND name=N'IX_AccountSetupTokens_Account')
 CREATE INDEX IX_AccountSetupTokens_Account ON [Authentication].[AccountSetupTokens](TenantId,IdentityId);
 IF OBJECT_ID(N'Identity.AccountAdministrationAudit',N'U') IS NULL
 CREATE TABLE [Identity].[AccountAdministrationAudit](
  Id uniqueidentifier NOT NULL PRIMARY KEY, TenantId uniqueidentifier NOT NULL,
  ActorTenantId uniqueidentifier NOT NULL, ActorId uniqueidentifier NOT NULL,
  TargetId uniqueidentifier NOT NULL, Action nvarchar(60) NOT NULL,
  At datetime2(7) NOT NULL, Reason nvarchar(500) NOT NULL, Version int NOT NULL,
  Details nvarchar(max) NOT NULL CONSTRAINT CK_AccountAdministrationAudit_Json CHECK(ISJSON(Details)=1)
 );
 IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'Identity.AccountAdministrationAudit') AND name=N'IX_AccountAdministrationAudit_Tenant')
 CREATE INDEX IX_AccountAdministrationAudit_Tenant ON [Identity].[AccountAdministrationAudit](TenantId,At,Id);
 /* Permission definitions only. No existing identity is promoted or assigned. */
 IF NOT EXISTS(SELECT 1 FROM [Identity].[Permissions] WHERE Resource=N'platform.users' AND Action=N'MANAGE' AND Scope=N'PLATFORM')
 INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope) VALUES(NEWID(),N'Manage client accounts',N'platform.users',N'MANAGE',N'PLATFORM');
 IF NOT EXISTS(SELECT 1 FROM [Identity].[Permissions] WHERE Resource=N'tenant.users' AND Action=N'MANAGE' AND Scope=N'TENANT')
 INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope) VALUES(NEWID(),N'Manage own client users',N'tenant.users',N'MANAGE',N'TENANT');
 IF NOT EXISTS(SELECT 1 FROM [Identity].[Permissions] WHERE Resource=N'platform.tenants' AND Action=N'READ' AND Scope=N'PLATFORM')
 INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope) VALUES(NEWID(),N'Read clients',N'platform.tenants',N'READ',N'PLATFORM');
 IF NOT EXISTS(SELECT 1 FROM [Identity].[Permissions] WHERE Resource=N'platform.tenants' AND Action=N'CREATE' AND Scope=N'PLATFORM')
 INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope) VALUES(NEWID(),N'Create clients',N'platform.tenants',N'CREATE',N'PLATFORM');
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
