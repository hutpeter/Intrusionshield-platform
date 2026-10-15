SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET ARITHABORT ON;
SET NUMERIC_ROUNDABORT OFF;

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(
        N'HIS.PatientRegistrations',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE HIS.PatientRegistrations
        (
            id uniqueidentifier NOT NULL,
            tenant_id uniqueidentifier NOT NULL,
            patient_id uniqueidentifier NOT NULL,
            facility_id uniqueidentifier NOT NULL,

            registration_number nvarchar(100) NOT NULL,
            registration_type nvarchar(30) NOT NULL,
            status nvarchar(20) NOT NULL,
            source nvarchar(30) NOT NULL,

            registered_at datetime2(7) NOT NULL,
            completed_at datetime2(7) NULL,
            cancelled_at datetime2(7) NULL,

            reason_for_visit nvarchar(1000) NULL,
            registration_location nvarchar(200) NULL,

            created_at datetime2(7) NOT NULL,
            updated_at datetime2(7) NOT NULL,
            version int NOT NULL
                CONSTRAINT DF_HIS_PatientRegistrations_Version
                DEFAULT (1),

            CONSTRAINT PK_HIS_PatientRegistrations
                PRIMARY KEY (id),

            CONSTRAINT UQ_HIS_PatientRegistrations_TenantId
                UNIQUE (tenant_id, id),

            CONSTRAINT UQ_HIS_PatientRegistrations_Number
                UNIQUE (tenant_id, registration_number),

            CONSTRAINT FK_HIS_PatientRegistrations_Patient
                FOREIGN KEY (tenant_id, patient_id)
                REFERENCES HIS.Patients
                (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_HIS_PatientRegistrations_Facility
                FOREIGN KEY (tenant_id, facility_id)
                REFERENCES HIS.Facilities
                (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_HIS_PatientRegistrations_Type
                CHECK
                (
                    registration_type IN
                    (
                        N'OUTPATIENT',
                        N'INPATIENT',
                        N'EMERGENCY',
                        N'OBSERVATION',
                        N'DAY_CASE'
                    )
                ),

            CONSTRAINT CK_HIS_PatientRegistrations_Status
                CHECK
                (
                    status IN
                    (
                        N'REGISTERED',
                        N'COMPLETED',
                        N'CANCELLED'
                    )
                ),

            CONSTRAINT CK_HIS_PatientRegistrations_Source
                CHECK
                (
                    source IN
                    (
                        N'WALK_IN',
                        N'REFERRAL',
                        N'TRANSFER',
                        N'SCHEDULED',
                        N'EMERGENCY',
                        N'OTHER'
                    )
                ),

            CONSTRAINT CK_HIS_PatientRegistrations_Version
                CHECK (version >= 1),

            CONSTRAINT CK_HIS_PatientRegistrations_CompletedAt
                CHECK
                (
                    completed_at IS NULL
                    OR completed_at >= registered_at
                ),

            CONSTRAINT CK_HIS_PatientRegistrations_CancelledAt
                CHECK
                (
                    cancelled_at IS NULL
                    OR cancelled_at >= registered_at
                ),

            CONSTRAINT CK_HIS_PatientRegistrations_StateDates
                CHECK
                (
                    (
                        status = N'COMPLETED'
                        AND completed_at IS NOT NULL
                        AND cancelled_at IS NULL
                    )
                    OR
                    (
                        status = N'CANCELLED'
                        AND cancelled_at IS NOT NULL
                        AND completed_at IS NULL
                    )
                    OR
                    (
                        status = N'REGISTERED'
                        AND completed_at IS NULL
                        AND cancelled_at IS NULL
                    )
                )
        );

        CREATE INDEX IX_HIS_PatientRegistrations_Patient
            ON HIS.PatientRegistrations
            (
                tenant_id,
                patient_id,
                registered_at DESC
            );

        CREATE INDEX IX_HIS_PatientRegistrations_Facility
            ON HIS.PatientRegistrations
            (
                tenant_id,
                facility_id,
                registered_at DESC
            );

        CREATE INDEX IX_HIS_PatientRegistrations_Status
            ON HIS.PatientRegistrations
            (
                tenant_id,
                status,
                registered_at DESC
            );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
