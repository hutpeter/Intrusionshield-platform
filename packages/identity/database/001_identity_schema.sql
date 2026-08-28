/* IntrusionShield Identity Platform - SQL Server schema
   Migration: 001_identity_schema
   Target: SQL Server 2025
*/

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'identity')
    EXEC(N'CREATE SCHEMA [identity]');
GO

CREATE TABLE [identity].[Tenants] (
    TenantId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_Tenants PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name nvarchar(200) NOT NULL,
    Slug nvarchar(100) NOT NULL,
    Status varchar(20) NOT NULL CONSTRAINT DF_Identity_Tenants_Status DEFAULT 'ACTIVE',
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_Tenants_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_Tenants_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Identity_Tenants_Slug UNIQUE (Slug),
    CONSTRAINT CK_Identity_Tenants_Status CHECK (Status IN ('ACTIVE','SUSPENDED','DISABLED'))
);
GO

CREATE TABLE [identity].[Identities] (
    IdentityId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_Identities PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    TenantId uniqueidentifier NOT NULL,
    IdentityType varchar(20) NOT NULL,
    Status varchar(20) NOT NULL CONSTRAINT DF_Identity_Identities_Status DEFAULT 'PENDING',
    DisplayName nvarchar(200) NOT NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_Identities_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_Identities_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Identity_Identities_Tenant FOREIGN KEY (TenantId) REFERENCES [identity].[Tenants](TenantId),
    CONSTRAINT CK_Identity_Identities_Type CHECK (IdentityType IN ('USER','SERVICE','APPLICATION','API')),
    CONSTRAINT CK_Identity_Identities_Status CHECK (Status IN ('ACTIVE','SUSPENDED','DISABLED','PENDING')),
    CONSTRAINT UQ_Identity_Identities_TenantIdentity UNIQUE (TenantId, IdentityId)
);
GO

CREATE TABLE [identity].[Users] (
    IdentityId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_Users PRIMARY KEY,
    Username nvarchar(100) NOT NULL,
    Email nvarchar(320) NOT NULL,
    EmailVerified bit NOT NULL CONSTRAINT DF_Identity_Users_EmailVerified DEFAULT 0,
    PasswordHash nvarchar(500) NULL,
    PasswordChangedAt datetime2(3) NULL,
    CONSTRAINT FK_Identity_Users_Identity FOREIGN KEY (IdentityId) REFERENCES [identity].[Identities](IdentityId) ON DELETE CASCADE,
    CONSTRAINT UQ_Identity_Users_Username UNIQUE (Username),
    CONSTRAINT UQ_Identity_Users_Email UNIQUE (Email)
);
GO

CREATE TABLE [identity].[IdentityTenantMemberships] (
    IdentityId uniqueidentifier NOT NULL,
    TenantId uniqueidentifier NOT NULL,
    MembershipStatus varchar(20) NOT NULL CONSTRAINT DF_Identity_Membership_Status DEFAULT 'ACTIVE',
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_Membership_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Identity_Membership PRIMARY KEY (IdentityId, TenantId),
    CONSTRAINT FK_Identity_Membership_Identity FOREIGN KEY (IdentityId) REFERENCES [identity].[Identities](IdentityId) ON DELETE CASCADE,
    CONSTRAINT FK_Identity_Membership_Tenant FOREIGN KEY (TenantId) REFERENCES [identity].[Tenants](TenantId),
    CONSTRAINT CK_Identity_Membership_Status CHECK (MembershipStatus IN ('ACTIVE','SUSPENDED','REVOKED'))
);
GO

CREATE TABLE [identity].[Roles] (
    RoleId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_Roles PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    TenantId uniqueidentifier NULL,
    Name nvarchar(100) NOT NULL,
    Description nvarchar(500) NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_Roles_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Identity_Roles_Tenant FOREIGN KEY (TenantId) REFERENCES [identity].[Tenants](TenantId),
    CONSTRAINT UQ_Identity_Roles_Tenant_Name UNIQUE (TenantId, Name)
);
GO

CREATE TABLE [identity].[Permissions] (
    PermissionId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_Permissions PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    Name nvarchar(150) NOT NULL,
    Resource nvarchar(150) NOT NULL,
    Action nvarchar(100) NOT NULL,
    Description nvarchar(500) NULL,
    CONSTRAINT UQ_Identity_Permissions_Name UNIQUE (Name),
    CONSTRAINT UQ_Identity_Permissions_Resource_Action UNIQUE (Resource, Action)
);
GO

CREATE TABLE [identity].[RolePermissions] (
    RoleId uniqueidentifier NOT NULL,
    PermissionId uniqueidentifier NOT NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_RolePermissions_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Identity_RolePermissions PRIMARY KEY (RoleId, PermissionId),
    CONSTRAINT FK_Identity_RolePermissions_Role FOREIGN KEY (RoleId) REFERENCES [identity].[Roles](RoleId) ON DELETE CASCADE,
    CONSTRAINT FK_Identity_RolePermissions_Permission FOREIGN KEY (PermissionId) REFERENCES [identity].[Permissions](PermissionId) ON DELETE CASCADE
);
GO

CREATE TABLE [identity].[IdentityRoles] (
    IdentityId uniqueidentifier NOT NULL,
    RoleId uniqueidentifier NOT NULL,
    TenantId uniqueidentifier NOT NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_IdentityRoles_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Identity_IdentityRoles PRIMARY KEY (IdentityId, RoleId, TenantId),
    CONSTRAINT FK_Identity_IdentityRoles_Identity FOREIGN KEY (IdentityId) REFERENCES [identity].[Identities](IdentityId) ON DELETE CASCADE,
    CONSTRAINT FK_Identity_IdentityRoles_Role FOREIGN KEY (RoleId) REFERENCES [identity].[Roles](RoleId) ON DELETE CASCADE,
    CONSTRAINT FK_Identity_IdentityRoles_Tenant FOREIGN KEY (TenantId) REFERENCES [identity].[Tenants](TenantId)
);
GO

CREATE TABLE [identity].[Sessions] (
    SessionId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_Sessions PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    IdentityId uniqueidentifier NOT NULL,
    TenantId uniqueidentifier NOT NULL,
    Status varchar(20) NOT NULL CONSTRAINT DF_Identity_Sessions_Status DEFAULT 'ACTIVE',
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_Sessions_CreatedAt DEFAULT SYSUTCDATETIME(),
    ExpiresAt datetime2(3) NOT NULL,
    RevokedAt datetime2(3) NULL,
    IpAddress varchar(45) NULL,
    UserAgent nvarchar(1000) NULL,
    CONSTRAINT FK_Identity_Sessions_Identity FOREIGN KEY (IdentityId) REFERENCES [identity].[Identities](IdentityId),
    CONSTRAINT FK_Identity_Sessions_Tenant FOREIGN KEY (TenantId) REFERENCES [identity].[Tenants](TenantId),
    CONSTRAINT CK_Identity_Sessions_Status CHECK (Status IN ('ACTIVE','EXPIRED','REVOKED'))
);
GO

CREATE TABLE [identity].[AuditEvents] (
    AuditEventId uniqueidentifier NOT NULL CONSTRAINT PK_Identity_AuditEvents PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
    TenantId uniqueidentifier NULL,
    IdentityId uniqueidentifier NULL,
    ActorId uniqueidentifier NULL,
    EventType nvarchar(150) NOT NULL,
    Success bit NOT NULL CONSTRAINT DF_Identity_AuditEvents_Success DEFAULT 1,
    Details nvarchar(max) NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Identity_AuditEvents_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_Identity_AuditEvents_Tenant FOREIGN KEY (TenantId) REFERENCES [identity].[Tenants](TenantId),
    CONSTRAINT FK_Identity_AuditEvents_Identity FOREIGN KEY (IdentityId) REFERENCES [identity].[Identities](IdentityId),
    CONSTRAINT FK_Identity_AuditEvents_Actor FOREIGN KEY (ActorId) REFERENCES [identity].[Identities](IdentityId)
);
GO

CREATE INDEX IX_Identity_Identities_Tenant_Status ON [identity].[Identities](TenantId, Status);
CREATE INDEX IX_Identity_Membership_Tenant_Status ON [identity].[IdentityTenantMemberships](TenantId, MembershipStatus);
CREATE INDEX IX_Identity_IdentityRoles_Tenant ON [identity].[IdentityRoles](TenantId, IdentityId);
CREATE INDEX IX_Identity_Sessions_Identity_Status ON [identity].[Sessions](IdentityId, Status);
CREATE INDEX IX_Identity_Sessions_ExpiresAt ON [identity].[Sessions](ExpiresAt);
CREATE INDEX IX_Identity_AuditEvents_Tenant_CreatedAt ON [identity].[AuditEvents](TenantId, CreatedAt);
GO
