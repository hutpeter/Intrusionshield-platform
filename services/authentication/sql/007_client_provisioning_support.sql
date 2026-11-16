/* Forward-only support for the existing audited client-creation service.
   Explicitly review/apply to the selected identity/platform database. No roles,
   clients, events or running workers are provisioned by applying this schema. */
/* Filtered indexes require these settings even when sqlcmd's connection defaults
   differ from the Node driver. Keep the migration independent of its caller. */
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
 IF SCHEMA_ID(N'Platform') IS NULL THROW 50000,'Platform registry schema required.',1;
 IF OBJECT_ID(N'Platform.TenantProvisioningAudit',N'U') IS NULL
 BEGIN
  CREATE TABLE [Platform].[TenantProvisioningAudit](
   Id uniqueidentifier NOT NULL PRIMARY KEY,
   CorrelationId uniqueidentifier NOT NULL,
   ActorIdentityId uniqueidentifier NOT NULL,
   ActorTenantId uniqueidentifier NOT NULL,
   RequestedTenantCode nvarchar(80) NOT NULL,
   TargetTenantId uniqueidentifier NULL,
   Operation nvarchar(20) NOT NULL,
   Status nvarchar(20) NOT NULL,
   StartedAt datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
   CompletedAt datetime2(7) NULL,
   FailureCode nvarchar(100) NULL,
   CONSTRAINT CK_TenantProvisioningAudit_Status CHECK(Status IN(N'STARTED',N'SUCCEEDED',N'FAILED'))
  );
  CREATE INDEX IX_TenantProvisioningAudit_Status ON [Platform].[TenantProvisioningAudit](Status,StartedAt,Id);
 END;
 IF OBJECT_ID(N'Platform.EventOutbox',N'U') IS NULL
 BEGIN
    CREATE TABLE [Platform].[EventOutbox] (
        Id uniqueidentifier NOT NULL
            CONSTRAINT PK_PlatformEventOutbox PRIMARY KEY,

        TenantId uniqueidentifier NULL,

        EventType nvarchar(200) NOT NULL,

        Payload nvarchar(max) NOT NULL,

        Metadata nvarchar(max) NOT NULL,

        Status nvarchar(20) NOT NULL
            CONSTRAINT DF_PlatformEventOutbox_Status
            DEFAULT N'PENDING',

        AttemptCount int NOT NULL
            CONSTRAINT DF_PlatformEventOutbox_AttemptCount
            DEFAULT 0,

        CreatedAt datetime2(7) NOT NULL
            CONSTRAINT DF_PlatformEventOutbox_CreatedAt
            DEFAULT SYSUTCDATETIME(),

        NextAttemptAt datetime2(7) NOT NULL
            CONSTRAINT DF_PlatformEventOutbox_NextAttemptAt
            DEFAULT SYSUTCDATETIME(),

        PublishedAt datetime2(7) NULL,

        LockedUntil datetime2(7) NULL,

        LockToken uniqueidentifier NULL,

        LastError nvarchar(2000) NULL,

        CONSTRAINT CK_PlatformEventOutbox_EventType
            CHECK (
                LEN(LTRIM(RTRIM(EventType))) BETWEEN 1 AND 200
            ),

        CONSTRAINT CK_PlatformEventOutbox_PayloadJson
            CHECK (ISJSON(Payload) = 1),

        CONSTRAINT CK_PlatformEventOutbox_MetadataJson
            CHECK (ISJSON(Metadata) = 1),

        CONSTRAINT CK_PlatformEventOutbox_Status
            CHECK (
                Status IN (
                    N'PENDING',
                    N'PROCESSING',
                    N'PUBLISHED',
                    N'FAILED'
                )
            ),

        CONSTRAINT CK_PlatformEventOutbox_AttemptCount
            CHECK (AttemptCount >= 0),

        CONSTRAINT CK_PlatformEventOutbox_PublishedAt
            CHECK (
                (
                    Status = N'PUBLISHED'
                    AND PublishedAt IS NOT NULL
                )
                OR
                (
                    Status <> N'PUBLISHED'
                    AND PublishedAt IS NULL
                )
            ),

        CONSTRAINT CK_PlatformEventOutbox_ProcessingLock
            CHECK (
                (
                    Status = N'PROCESSING'
                    AND LockedUntil IS NOT NULL
                    AND LockToken IS NOT NULL
                )
                OR
                (
                    Status <> N'PROCESSING'
                    AND LockedUntil IS NULL
                    AND LockToken IS NULL
                )
            )
    );

    CREATE INDEX IX_PlatformEventOutbox_Pending
        ON [Platform].[EventOutbox] (
            NextAttemptAt,
            CreatedAt,
            Id
        )
        WHERE Status = N'PENDING';

    CREATE INDEX IX_PlatformEventOutbox_ExpiredLocks
        ON [Platform].[EventOutbox] (
            LockedUntil,
            Id
        )
        WHERE Status = N'PROCESSING';

    CREATE INDEX IX_PlatformEventOutbox_TenantCreated
        ON [Platform].[EventOutbox] (
            TenantId,
            CreatedAt,
            Id
        );

 END;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
