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
        N'HIS.Encounters',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE HIS.Encounters
        (
            id uniqueidentifier NOT NULL,
            tenant_id uniqueidentifier NOT NULL,
            patient_id uniqueidentifier NOT NULL,
            facility_id uniqueidentifier NOT NULL,

            registration_id uniqueidentifier NULL,
            attending_practitioner_id
                uniqueidentifier NULL,

            encounter_number nvarchar(100) NOT NULL,
            encounter_type nvarchar(30) NOT NULL,
            status nvarchar(30) NOT NULL,
            source nvarchar(30) NOT NULL,

            started_at datetime2(7) NOT NULL,
            ended_at datetime2(7) NULL,

            reason_for_encounter nvarchar(1000) NULL,
            referral_source nvarchar(500) NULL,
            location_description nvarchar(500) NULL,

            created_at datetime2(7) NOT NULL,
            updated_at datetime2(7) NOT NULL,

            version int NOT NULL
                CONSTRAINT DF_HIS_Encounters_Version
                DEFAULT (1),

            CONSTRAINT PK_HIS_Encounters
                PRIMARY KEY (id),

            CONSTRAINT UQ_HIS_Encounters_TenantId
                UNIQUE (tenant_id, id),

            CONSTRAINT UQ_HIS_Encounters_Number
                UNIQUE (
                    tenant_id,
                    encounter_number
                ),

            CONSTRAINT FK_HIS_Encounters_Patient
                FOREIGN KEY (
                    tenant_id,
                    patient_id
                )
                REFERENCES HIS.Patients
                (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_HIS_Encounters_Facility
                FOREIGN KEY (
                    tenant_id,
                    facility_id
                )
                REFERENCES HIS.Facilities
                (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_HIS_Encounters_Registration
                FOREIGN KEY (
                    tenant_id,
                    registration_id
                )
                REFERENCES HIS.PatientRegistrations
                (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_HIS_Encounters_Practitioner
                FOREIGN KEY (
                    tenant_id,
                    attending_practitioner_id
                )
                REFERENCES HIS.Practitioners
                (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_HIS_Encounters_Type
                CHECK
                (
                    encounter_type IN
                    (
                        N'OUTPATIENT',
                        N'INPATIENT',
                        N'EMERGENCY',
                        N'OBSERVATION',
                        N'DAY_CASE',
                        N'VIRTUAL'
                    )
                ),

            CONSTRAINT CK_HIS_Encounters_Status
                CHECK
                (
                    status IN
                    (
                        N'PLANNED',
                        N'ARRIVED',
                        N'IN_PROGRESS',
                        N'ON_HOLD',
                        N'FINISHED',
                        N'CANCELLED'
                    )
                ),

            CONSTRAINT CK_HIS_Encounters_Source
                CHECK
                (
                    source IN
                    (
                        N'REGISTRATION',
                        N'SCHEDULED',
                        N'WALK_IN',
                        N'REFERRAL',
                        N'TRANSFER',
                        N'EMERGENCY',
                        N'OTHER'
                    )
                ),

            CONSTRAINT CK_HIS_Encounters_Version
                CHECK (version >= 1),

            CONSTRAINT CK_HIS_Encounters_EndDate
                CHECK
                (
                    ended_at IS NULL
                    OR ended_at >= started_at
                ),

            CONSTRAINT CK_HIS_Encounters_StateDate
                CHECK
                (
                    (
                        status = N'FINISHED'
                        AND ended_at IS NOT NULL
                    )
                    OR
                    (
                        status <> N'FINISHED'
                        AND ended_at IS NULL
                    )
                )
        );

        CREATE INDEX IX_HIS_Encounters_Patient
            ON HIS.Encounters
            (
                tenant_id,
                patient_id,
                started_at DESC
            );

        CREATE INDEX IX_HIS_Encounters_Facility
            ON HIS.Encounters
            (
                tenant_id,
                facility_id,
                started_at DESC
            );

        CREATE INDEX IX_HIS_Encounters_Status
            ON HIS.Encounters
            (
                tenant_id,
                status,
                started_at DESC
            );

        CREATE INDEX IX_HIS_Encounters_Registration
            ON HIS.Encounters
            (
                tenant_id,
                registration_id
            )
            WHERE registration_id IS NOT NULL;

        CREATE INDEX IX_HIS_Encounters_Practitioner
            ON HIS.Encounters
            (
                tenant_id,
                attending_practitioner_id,
                started_at DESC
            )
            WHERE attending_practitioner_id
                IS NOT NULL;
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
