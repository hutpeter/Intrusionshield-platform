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
        N'HIS.PersonFacilityAffiliations',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE HIS.PersonFacilityAffiliations
        (
            id uniqueidentifier NOT NULL,
            tenant_id uniqueidentifier NOT NULL,
            person_id uniqueidentifier NOT NULL,
            facility_id uniqueidentifier NOT NULL,

            affiliation_type nvarchar(30) NOT NULL,

            is_primary bit NOT NULL
                CONSTRAINT DF_HIS_PersonFacilityAffiliations_IsPrimary
                DEFAULT (0),

            effective_from datetime2 NOT NULL,
            effective_until datetime2 NULL,

            created_at datetime2 NOT NULL,
            updated_at datetime2 NOT NULL,

            version int NOT NULL
                CONSTRAINT DF_HIS_PersonFacilityAffiliations_Version
                DEFAULT (1),

            CONSTRAINT PK_HIS_PersonFacilityAffiliations
                PRIMARY KEY (id),

            CONSTRAINT UQ_HIS_PersonFacilityAffiliations_TenantId
                UNIQUE (tenant_id, id),

            CONSTRAINT CK_HIS_PersonFacilityAffiliations_Type
                CHECK
                (
                    affiliation_type IN
                    (
                        N'PATIENT_CARE',
                        N'PRACTITIONER_ASSIGNMENT',
                        N'GENERAL'
                    )
                ),

            CONSTRAINT CK_HIS_PersonFacilityAffiliations_Dates
                CHECK
                (
                    effective_until IS NULL
                    OR effective_until >= effective_from
                ),

            CONSTRAINT CK_HIS_PersonFacilityAffiliations_Version
                CHECK
                (
                    version > 0
                ),

            CONSTRAINT FK_HIS_PersonFacilityAffiliations_Person
                FOREIGN KEY
                (
                    tenant_id,
                    person_id
                )
                REFERENCES HIS.Persons
                (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_HIS_PersonFacilityAffiliations_Facility
                FOREIGN KEY
                (
                    tenant_id,
                    facility_id
                )
                REFERENCES HIS.Facilities
                (
                    tenant_id,
                    id
                )
        );

        CREATE INDEX IX_HIS_PersonFacilityAffiliations_Person
            ON HIS.PersonFacilityAffiliations
            (
                tenant_id,
                person_id,
                effective_from
            );

        CREATE INDEX IX_HIS_PersonFacilityAffiliations_Facility
            ON HIS.PersonFacilityAffiliations
            (
                tenant_id,
                facility_id,
                effective_from
            );

        CREATE UNIQUE INDEX UX_HIS_PersonFacilityAffiliations_ActivePrimary
            ON HIS.PersonFacilityAffiliations
            (
                tenant_id,
                person_id
            )
            WHERE
                is_primary = 1
                AND effective_until IS NULL;

        CREATE UNIQUE INDEX UX_HIS_PersonFacilityAffiliations_ActiveRelationship
            ON HIS.PersonFacilityAffiliations
            (
                tenant_id,
                person_id,
                facility_id,
                affiliation_type
            )
            WHERE
                effective_until IS NULL;
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