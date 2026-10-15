/*
    EIS Authentication Foundation

    This migration deliberately keeps credentials separate from identity
    profile data. Password hashes are never stored on the Identity user
    record itself.

    The Identity.Users ALTER assumes the existing Identity schema/table
    created by the identity persistence foundation.
*/

IF NOT EXISTS (
    SELECT 1
    FROM sys.schemas
    WHERE name = N'Authentication'
)
BEGIN
    EXEC(N'CREATE SCHEMA [Authentication]');
END;
GO

IF COL_LENGTH(
    N'Identity.Users',
    N'PreferredLanguage'
) IS NULL
BEGIN
    ALTER TABLE [Identity].[Users]
    ADD PreferredLanguage nvarchar(35) NULL;
END;
GO

IF OBJECT_ID(
    N'Authentication.Credentials',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE [Authentication].[Credentials]
    (
        TenantId uniqueidentifier NOT NULL,
        IdentityId uniqueidentifier NOT NULL,
        PasswordHash nvarchar(512) NOT NULL,
        PasswordChangedAt datetime2(7) NOT NULL
            CONSTRAINT DF_AuthenticationCredentials_PasswordChangedAt
            DEFAULT SYSUTCDATETIME(),
        FailedAttemptCount int NOT NULL
            CONSTRAINT DF_AuthenticationCredentials_FailedAttemptCount
            DEFAULT 0,
        LockedUntil datetime2(7) NULL,
        CreatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_AuthenticationCredentials_CreatedAt
            DEFAULT SYSUTCDATETIME(),
        UpdatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_AuthenticationCredentials_UpdatedAt
            DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_AuthenticationCredentials
            PRIMARY KEY (TenantId, IdentityId)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name =
        N'FK_AuthenticationCredentials_Identity'
)
BEGIN
    ALTER TABLE [Authentication].[Credentials]
    WITH CHECK
    ADD CONSTRAINT
        FK_AuthenticationCredentials_Identity
    FOREIGN KEY (TenantId, IdentityId)
    REFERENCES [Identity].[Identities]
        (TenantId, Id);

    ALTER TABLE [Authentication].[Credentials]
    CHECK CONSTRAINT
        FK_AuthenticationCredentials_Identity;
END;
GO
