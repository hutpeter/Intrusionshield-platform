IF NOT EXISTS (
    SELECT 1
    FROM sys.schemas
    WHERE name = 'HIS'
)
BEGIN
    EXEC('CREATE SCHEMA HIS');
END;
GO

IF OBJECT_ID(
    'HIS.AvailabilityRules',
    'U'
) IS NULL
BEGIN
    CREATE TABLE HIS.AvailabilityRules
    (
        id uniqueidentifier NOT NULL,
        tenant_id uniqueidentifier NOT NULL,

        resource_type varchar(32) NOT NULL,
        resource_id uniqueidentifier NOT NULL,

        day_of_week tinyint NOT NULL,

        start_time char(5) NOT NULL,
        end_time char(5) NOT NULL,

        effective_from date NOT NULL,
        effective_to date NULL,

        active bit NOT NULL
            CONSTRAINT DF_HIS_AvailabilityRules_Active
            DEFAULT (1),

        created_at datetime2(7) NOT NULL,
        updated_at datetime2(7) NOT NULL,

        version int NOT NULL,

        CONSTRAINT PK_HIS_AvailabilityRules
            PRIMARY KEY (id),

        CONSTRAINT CK_HIS_AvailabilityRules_ResourceType
            CHECK (
                resource_type IN (
                    'PRACTITIONER',
                    'CLINICAL_LOCATION'
                )
            ),

        CONSTRAINT CK_HIS_AvailabilityRules_DayOfWeek
            CHECK (
                day_of_week BETWEEN 0 AND 6
            ),

        CONSTRAINT CK_HIS_AvailabilityRules_TimeRange
            CHECK (
                end_time > start_time
            ),

        CONSTRAINT CK_HIS_AvailabilityRules_EffectiveRange
            CHECK (
                effective_to IS NULL
                OR effective_to >= effective_from
            ),

        CONSTRAINT CK_HIS_AvailabilityRules_Version
            CHECK (
                version >= 1
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name =
        'IX_HIS_AvailabilityRules_Resource'
      AND object_id =
        OBJECT_ID('HIS.AvailabilityRules')
)
BEGIN
    CREATE INDEX
        IX_HIS_AvailabilityRules_Resource
    ON HIS.AvailabilityRules
    (
        tenant_id,
        resource_type,
        resource_id,
        day_of_week,
        active,
        effective_from,
        effective_to
    );
END;
GO

IF OBJECT_ID(
    'HIS.AvailabilityExceptions',
    'U'
) IS NULL
BEGIN
    CREATE TABLE HIS.AvailabilityExceptions
    (
        id uniqueidentifier NOT NULL,
        tenant_id uniqueidentifier NOT NULL,

        resource_type varchar(32) NOT NULL,
        resource_id uniqueidentifier NOT NULL,

        starts_at datetime2(7) NOT NULL,
        ends_at datetime2(7) NOT NULL,

        exception_type varchar(16) NOT NULL,

        reason nvarchar(500) NULL,

        created_at datetime2(7) NOT NULL,
        updated_at datetime2(7) NOT NULL,

        version int NOT NULL,

        CONSTRAINT PK_HIS_AvailabilityExceptions
            PRIMARY KEY (id),

        CONSTRAINT CK_HIS_AvailabilityExceptions_ResourceType
            CHECK (
                resource_type IN (
                    'PRACTITIONER',
                    'CLINICAL_LOCATION'
                )
            ),

        CONSTRAINT CK_HIS_AvailabilityExceptions_Type
            CHECK (
                exception_type IN (
                    'UNAVAILABLE',
                    'AVAILABLE'
                )
            ),

        CONSTRAINT CK_HIS_AvailabilityExceptions_TimeRange
            CHECK (
                ends_at > starts_at
            ),

        CONSTRAINT CK_HIS_AvailabilityExceptions_Version
            CHECK (
                version >= 1
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name =
        'IX_HIS_AvailabilityExceptions_Resource_Time'
      AND object_id =
        OBJECT_ID('HIS.AvailabilityExceptions')
)
BEGIN
    CREATE INDEX
        IX_HIS_AvailabilityExceptions_Resource_Time
    ON HIS.AvailabilityExceptions
    (
        tenant_id,
        resource_type,
        resource_id,
        starts_at,
        ends_at
    );
END;
GO
