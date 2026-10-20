/*
 Ruby Platform Tenant Registry — forward-only migration.
 Apply ONLY to an approved disposable/development Platform database after review.
 This file does not provision operators or grant roles.
*/
SET XACT_ABORT ON;
GO
BEGIN TRY
 BEGIN TRANSACTION;
 IF SCHEMA_ID(N'Platform') IS NULL EXEC(N'CREATE SCHEMA [Platform]');
 IF OBJECT_ID(N'Platform.Tenants', N'U') IS NULL
 BEGIN
  CREATE TABLE [Platform].[Tenants] (
   Id uniqueidentifier NOT NULL CONSTRAINT PK_PlatformTenants PRIMARY KEY,
   Code nvarchar(80) NOT NULL,
   NormalizedCode nvarchar(80) NOT NULL,
   DisplayName nvarchar(200) NOT NULL,
   CountryCode char(2) NOT NULL,
   Status nvarchar(20) NOT NULL CONSTRAINT DF_PlatformTenants_Status DEFAULT N'ACTIVE',
   CreatedAt datetime2(7) NOT NULL CONSTRAINT DF_PlatformTenants_CreatedAt DEFAULT SYSUTCDATETIME(),
   UpdatedAt datetime2(7) NOT NULL CONSTRAINT DF_PlatformTenants_UpdatedAt DEFAULT SYSUTCDATETIME(),
   Version int NOT NULL CONSTRAINT DF_PlatformTenants_Version DEFAULT 1,
   CONSTRAINT UQ_PlatformTenants_NormalizedCode UNIQUE (NormalizedCode),
   CONSTRAINT CK_PlatformTenants_Status CHECK (Status IN (N'ACTIVE', N'SUSPENDED', N'DISABLED')),
   CONSTRAINT CK_PlatformTenants_Code CHECK (LEN(Code) BETWEEN 2 AND 80),
   CONSTRAINT CK_PlatformTenants_DisplayName CHECK (LEN(LTRIM(RTRIM(DisplayName))) BETWEEN 2 AND 200),
   CONSTRAINT CK_PlatformTenants_CountryCode CHECK (CountryCode COLLATE Latin1_General_BIN2 LIKE '[A-Z][A-Z]'),
   CONSTRAINT CK_PlatformTenants_Version CHECK (Version >= 1)
  );
  CREATE INDEX IX_PlatformTenants_StatusName ON [Platform].[Tenants] (Status, DisplayName, Id);
 END;
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
GO
