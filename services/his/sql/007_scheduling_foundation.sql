IF NOT EXISTS (
    SELECT 1
    FROM sys.schemas
    WHERE name = 'HIS'
)
BEGIN
    EXEC('CREATE SCHEMA HIS');
END;
GO

IF OBJECT_ID('HIS.Appointments', 'U') IS NULL
BEGIN
    CREATE TABLE HIS.Appointments
    (
        id UNIQUEIDENTIFIER NOT NULL,
        tenant_id UNIQUEIDENTIFIER NOT NULL,

        patient_id UNIQUEIDENTIFIER NOT NULL,
        facility_id UNIQUEIDENTIFIER NOT NULL,

        practitioner_id UNIQUEIDENTIFIER NULL,
        clinical_location_id UNIQUEIDENTIFIER NULL,
        encounter_id UNIQUEIDENTIFIER NULL,

        appointment_number NVARCHAR(64) NOT NULL,
        appointment_type NVARCHAR(32) NOT NULL,
        status NVARCHAR(32) NOT NULL,
        source NVARCHAR(32) NOT NULL,

        scheduled_start DATETIME2(3) NOT NULL,
        scheduled_end DATETIME2(3) NOT NULL,

        reason NVARCHAR(1000) NULL,
        notes NVARCHAR(4000) NULL,

        cancellation_reason NVARCHAR(1000) NULL,
        cancelled_at DATETIME2(3) NULL,

        checked_in_at DATETIME2(3) NULL,
        completed_at DATETIME2(3) NULL,

        created_at DATETIME2(3) NOT NULL,
        updated_at DATETIME2(3) NOT NULL,
        version INT NOT NULL,

        CONSTRAINT PK_HIS_Appointments
            PRIMARY KEY (id),

        CONSTRAINT CK_HIS_Appointments_TimeRange
            CHECK (scheduled_end > scheduled_start),

        CONSTRAINT CK_HIS_Appointments_Version
            CHECK (version >= 1),

        CONSTRAINT CK_HIS_Appointments_Status
            CHECK (
                status IN (
                    'BOOKED',
                    'CONFIRMED',
                    'CHECKED_IN',
                    'COMPLETED',
                    'CANCELLED',
                    'NO_SHOW'
                )
            ),

        CONSTRAINT CK_HIS_Appointments_Type
            CHECK (
                appointment_type IN (
                    'CONSULTATION',
                    'FOLLOW_UP',
                    'PROCEDURE',
                    'DIAGNOSTIC',
                    'THERAPY',
                    'VIRTUAL',
                    'OTHER'
                )
            ),

        CONSTRAINT CK_HIS_Appointments_Source
            CHECK (
                source IN (
                    'STAFF',
                    'PATIENT_PORTAL',
                    'REFERRAL',
                    'WALK_IN',
                    'EXTERNAL',
                    'OTHER'
                )
            )
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = 'UX_HIS_Appointments_Tenant_Number'
        AND object_id = OBJECT_ID('HIS.Appointments')
)
BEGIN
    CREATE UNIQUE INDEX
        UX_HIS_Appointments_Tenant_Number
    ON HIS.Appointments
    (
        tenant_id,
        appointment_number
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = 'IX_HIS_Appointments_Patient'
        AND object_id = OBJECT_ID('HIS.Appointments')
)
BEGIN
    CREATE INDEX
        IX_HIS_Appointments_Patient
    ON HIS.Appointments
    (
        tenant_id,
        patient_id,
        scheduled_start
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = 'IX_HIS_Appointments_Practitioner_Time'
        AND object_id = OBJECT_ID('HIS.Appointments')
)
BEGIN
    CREATE INDEX
        IX_HIS_Appointments_Practitioner_Time
    ON HIS.Appointments
    (
        tenant_id,
        practitioner_id,
        scheduled_start,
        scheduled_end
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = 'IX_HIS_Appointments_Location_Time'
        AND object_id = OBJECT_ID('HIS.Appointments')
)
BEGIN
    CREATE INDEX
        IX_HIS_Appointments_Location_Time
    ON HIS.Appointments
    (
        tenant_id,
        clinical_location_id,
        scheduled_start,
        scheduled_end
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE
        name = 'IX_HIS_Appointments_Facility_Time'
        AND object_id = OBJECT_ID('HIS.Appointments')
)
BEGIN
    CREATE INDEX
        IX_HIS_Appointments_Facility_Time
    ON HIS.Appointments
    (
        tenant_id,
        facility_id,
        scheduled_start
    );
END;
GO
