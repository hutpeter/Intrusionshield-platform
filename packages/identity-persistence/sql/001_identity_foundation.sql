/*
    EIS Identity Persistence Foundation

    Establishes the physical persistence required by the existing
    @intrusionshield/identity domain and by the authentication service.

    TenantId is part of every identity key so identity references cannot
    cross tenant boundaries.
*/

IF NOT EXISTS (
    SELECT 1
    FROM sys.schemas
    WHERE name = N'Identity'
)
BEGIN
    EXEC(N'CREATE SCHEMA [Identity]');
END;
GO

IF OBJECT_ID(
    N'Identity.Identities',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE [Identity].[Identities]
    (
        TenantId uniqueidentifier NOT NULL,
        Id uniqueidentifier NOT NULL,
        IdentityType nvarchar(20) NOT NULL,
        Status nvarchar(20) NOT NULL,
        DisplayName nvarchar(200) NOT NULL,
        CreatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_IdentityIdentities_CreatedAt
            DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_IdentityIdentities_UpdatedAt
            DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_IdentityIdentities
            PRIMARY KEY (TenantId, Id),

        CONSTRAINT CK_IdentityIdentities_Type
            CHECK (
                IdentityType IN (
                    N'USER',
                    N'SERVICE',
                    N'APPLICATION',
                    N'API'
                )
            ),

        CONSTRAINT CK_IdentityIdentities_Status
            CHECK (
                Status IN (
                    N'ACTIVE',
                    N'SUSPENDED',
                    N'DISABLED',
                    N'PENDING'
                )
            )
    );
END;
GO

IF OBJECT_ID(
    N'Identity.Users',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE [Identity].[Users]
    (
        TenantId uniqueidentifier NOT NULL,
        IdentityId uniqueidentifier NOT NULL,
        Username nvarchar(200) NOT NULL,
        NormalizedUsername nvarchar(200) NOT NULL,
        Email nvarchar(320) NOT NULL,
        NormalizedEmail nvarchar(320) NOT NULL,
        EmailVerified bit NOT NULL
            CONSTRAINT DF_IdentityUsers_EmailVerified
            DEFAULT 0,
        CreatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_IdentityUsers_CreatedAt
            DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_IdentityUsers_UpdatedAt
            DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_IdentityUsers
            PRIMARY KEY (TenantId, IdentityId),

        CONSTRAINT FK_IdentityUsers_Identity
            FOREIGN KEY (TenantId, IdentityId)
            REFERENCES [Identity].[Identities]
                (TenantId, Id)
    );

    CREATE UNIQUE INDEX
        UX_IdentityUsers_Tenant_NormalizedUsername
    ON [Identity].[Users]
        (TenantId, NormalizedUsername);

    CREATE INDEX
        IX_IdentityUsers_Tenant_NormalizedEmail
    ON [Identity].[Users]
        (TenantId, NormalizedEmail);
END;
GO

IF OBJECT_ID(
    N'Identity.ServiceIdentities',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE [Identity].[ServiceIdentities]
    (
        TenantId uniqueidentifier NOT NULL,
        IdentityId uniqueidentifier NOT NULL,
        ServiceName nvarchar(200) NOT NULL,
        CreatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_IdentityServiceIdentities_CreatedAt
            DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_IdentityServiceIdentities_UpdatedAt
            DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_IdentityServiceIdentities
            PRIMARY KEY (TenantId, IdentityId),

        CONSTRAINT FK_IdentityServiceIdentities_Identity
            FOREIGN KEY (TenantId, IdentityId)
            REFERENCES [Identity].[Identities]
                (TenantId, Id),

        CONSTRAINT UQ_IdentityServiceIdentities_Tenant_ServiceName
            UNIQUE (TenantId, ServiceName)
    );
END;
GO
