SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;

-- ============================================================
-- HIS.Admissions
-- ============================================================

IF OBJECT_ID(
    N'HIS.Admissions',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE HIS.Admissions
    (
        id UNIQUEIDENTIFIER NOT NULL,
        tenant_id UNIQUEIDENTIFIER NOT NULL,
        patient_id UNIQUEIDENTIFIER NOT NULL,
        encounter_id UNIQUEIDENTIFIER NOT NULL,
        facility_id UNIQUEIDENTIFIER NOT NULL,

        admission_number NVARCHAR(50) NOT NULL,
        admission_type NVARCHAR(30) NOT NULL,
        admission_source NVARCHAR(30) NOT NULL,
        status NVARCHAR(20) NOT NULL,

        admitted_at DATETIME2(7) NOT NULL,
        discharged_at DATETIME2(7) NULL,

        admitting_practitioner_id
            UNIQUEIDENTIFIER NULL,

        reason_for_admission
            NVARCHAR(1000) NULL,

        discharge_disposition
            NVARCHAR(40) NULL,

        discharge_notes
            NVARCHAR(2000) NULL,

        created_at DATETIME2(7) NOT NULL,
        updated_at DATETIME2(7) NOT NULL,
        version INT NOT NULL,

        CONSTRAINT PK_HIS_Admissions
            PRIMARY KEY (id),

        CONSTRAINT UQ_HIS_Admissions_Tenant_Id
            UNIQUE (tenant_id, id),

        CONSTRAINT CK_HIS_Admissions_Type
            CHECK (
                admission_type IN (
                    'INPATIENT',
                    'OBSERVATION',
                    'EMERGENCY',
                    'DAY_CASE'
                )
            ),

        CONSTRAINT CK_HIS_Admissions_Source
            CHECK (
                admission_source IN (
                    'EMERGENCY',
                    'PHYSICIAN_REFERRAL',
                    'CLINIC_REFERRAL',
                    'TRANSFER',
                    'DIRECT',
                    'OTHER'
                )
            ),

        CONSTRAINT CK_HIS_Admissions_Status
            CHECK (
                status IN (
                    'ACTIVE',
                    'DISCHARGED',
                    'CANCELLED'
                )
            ),

        CONSTRAINT CK_HIS_Admissions_Version
            CHECK (version > 0),

        CONSTRAINT CK_HIS_Admissions_Dates
            CHECK (
                discharged_at IS NULL
                OR discharged_at >= admitted_at
            ),

        CONSTRAINT CK_HIS_Admissions_Discharge
            CHECK (
                (
                    status = 'DISCHARGED'
                    AND discharged_at IS NOT NULL
                )
                OR
                (
                    status <> 'DISCHARGED'
                    AND discharged_at IS NULL
                )
            )
    );
END;


-- ============================================================
-- Admission indexes
-- These are outside CREATE TABLE so migration 005 can safely
-- resume after a partially completed execution.
-- ============================================================

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.Admissions')
      AND name =
        N'UX_HIS_Admissions_Tenant_Number'
)
BEGIN
    CREATE UNIQUE INDEX
        UX_HIS_Admissions_Tenant_Number
    ON HIS.Admissions
    (
        tenant_id,
        admission_number
    );
END;


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.Admissions')
      AND name =
        N'UX_HIS_Admissions_Active_Encounter'
)
BEGIN
    CREATE UNIQUE INDEX
        UX_HIS_Admissions_Active_Encounter
    ON HIS.Admissions
    (
        tenant_id,
        encounter_id
    )
    WHERE status = 'ACTIVE';
END;


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.Admissions')
      AND name =
        N'IX_HIS_Admissions_Patient'
)
BEGIN
    CREATE INDEX
        IX_HIS_Admissions_Patient
    ON HIS.Admissions
    (
        tenant_id,
        patient_id,
        admitted_at DESC
    );
END;


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.Admissions')
      AND name =
        N'IX_HIS_Admissions_Facility_Status'
)
BEGIN
    CREATE INDEX
        IX_HIS_Admissions_Facility_Status
    ON HIS.Admissions
    (
        tenant_id,
        facility_id,
        status
    );
END;


-- ============================================================
-- HIS.BedAssignments
-- ============================================================

IF OBJECT_ID(
    N'HIS.BedAssignments',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE HIS.BedAssignments
    (
        id UNIQUEIDENTIFIER NOT NULL,
        tenant_id UNIQUEIDENTIFIER NOT NULL,

        admission_id UNIQUEIDENTIFIER NOT NULL,
        encounter_id UNIQUEIDENTIFIER NOT NULL,
        patient_id UNIQUEIDENTIFIER NOT NULL,
        facility_id UNIQUEIDENTIFIER NOT NULL,
        bed_id UNIQUEIDENTIFIER NOT NULL,

        assignment_type NVARCHAR(20) NOT NULL,
        status NVARCHAR(20) NOT NULL,

        assigned_at DATETIME2(7) NOT NULL,
        released_at DATETIME2(7) NULL,

        release_reason NVARCHAR(20) NULL,
        notes NVARCHAR(1000) NULL,

        created_at DATETIME2(7) NOT NULL,
        updated_at DATETIME2(7) NOT NULL,
        version INT NOT NULL,

        CONSTRAINT PK_HIS_BedAssignments
            PRIMARY KEY (id),

        CONSTRAINT UQ_HIS_BedAssignments_Tenant_Id
            UNIQUE (tenant_id, id),

        CONSTRAINT CK_HIS_BedAssignments_Type
            CHECK (
                assignment_type IN (
                    'ADMISSION',
                    'TRANSFER'
                )
            ),

        CONSTRAINT CK_HIS_BedAssignments_Status
            CHECK (
                status IN (
                    'ACTIVE',
                    'RELEASED'
                )
            ),

        CONSTRAINT CK_HIS_BedAssignments_ReleaseReason
            CHECK (
                release_reason IS NULL
                OR release_reason IN (
                    'TRANSFER',
                    'DISCHARGE',
                    'CANCELLED',
                    'OTHER'
                )
            ),

        CONSTRAINT CK_HIS_BedAssignments_Dates
            CHECK (
                released_at IS NULL
                OR released_at >= assigned_at
            ),

        CONSTRAINT CK_HIS_BedAssignments_Release
            CHECK (
                (
                    status = 'ACTIVE'
                    AND released_at IS NULL
                    AND release_reason IS NULL
                )
                OR
                (
                    status = 'RELEASED'
                    AND released_at IS NOT NULL
                )
            ),

        CONSTRAINT CK_HIS_BedAssignments_Version
            CHECK (version > 0),

        CONSTRAINT FK_HIS_BedAssignments_Admission
            FOREIGN KEY (
                tenant_id,
                admission_id
            )
            REFERENCES HIS.Admissions (
                tenant_id,
                id
            )
    );
END;


-- ============================================================
-- Bed Assignment indexes
-- ============================================================

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.BedAssignments')
      AND name =
        N'UX_HIS_BedAssignments_Active_Admission'
)
BEGIN
    CREATE UNIQUE INDEX
        UX_HIS_BedAssignments_Active_Admission
    ON HIS.BedAssignments
    (
        tenant_id,
        admission_id
    )
    WHERE status = 'ACTIVE';
END;


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.BedAssignments')
      AND name =
        N'UX_HIS_BedAssignments_Active_Bed'
)
BEGIN
    CREATE UNIQUE INDEX
        UX_HIS_BedAssignments_Active_Bed
    ON HIS.BedAssignments
    (
        tenant_id,
        bed_id
    )
    WHERE status = 'ACTIVE';
END;


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.BedAssignments')
      AND name =
        N'IX_HIS_BedAssignments_History'
)
BEGIN
    CREATE INDEX
        IX_HIS_BedAssignments_History
    ON HIS.BedAssignments
    (
        tenant_id,
        admission_id,
        assigned_at
    );
END;


IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id =
        OBJECT_ID(N'HIS.BedAssignments')
      AND name =
        N'IX_HIS_BedAssignments_Patient'
)
BEGIN
    CREATE INDEX
        IX_HIS_BedAssignments_Patient
    ON HIS.BedAssignments
    (
        tenant_id,
        patient_id,
        assigned_at DESC
    );
END;
