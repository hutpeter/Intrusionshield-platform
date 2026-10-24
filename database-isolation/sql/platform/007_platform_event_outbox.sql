
/*
 Ruby Platform Event Outbox - forward-only migration.

 Apply only to an approved disposable development database.
 This migration does not grant permissions, publish events,
 or enable tenant creation.

 Delivery is at least once. Consumers must be idempotent.
*/

SET XACT_ABORT ON;
GO

BEGIN TRY
    BEGIN TRANSACTION;

    IF DB_NAME() <> N'Ruby_Isolation_Rehearsal_Platform'
    BEGIN
        THROW 51000,
            'Event outbox migration is restricted to the approved rehearsal database.',
            1;
    END;

    IF SCHEMA_ID(N'Platform') IS NULL
    BEGIN
        THROW 51001,
            'Required Platform schema does not exist.',
            1;
    END;

    IF OBJECT_ID(N'Platform.EventOutbox', N'U') IS NOT NULL
    BEGIN
        THROW 51002,
            'Platform.EventOutbox already exists. Review its structure before proceeding.',
            1;
    END;

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

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
GO
