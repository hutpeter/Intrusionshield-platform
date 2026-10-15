SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(
        N'HIS.ClinicalLocations',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE HIS.ClinicalLocations
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            facility_id UNIQUEIDENTIFIER NOT NULL,
            parent_location_id UNIQUEIDENTIFIER NULL,

            code NVARCHAR(100) NOT NULL,
            name NVARCHAR(250) NOT NULL,

            location_type NVARCHAR(30) NOT NULL,
            status NVARCHAR(20) NOT NULL,

            description NVARCHAR(1000) NULL,
            floor NVARCHAR(100) NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,

            version INT NOT NULL
                CONSTRAINT DF_ClinicalLocations_Version
                DEFAULT (1),

            CONSTRAINT PK_ClinicalLocations
                PRIMARY KEY (id),

            CONSTRAINT UQ_ClinicalLocations_Tenant_Id
                UNIQUE (tenant_id, id),

            CONSTRAINT UQ_ClinicalLocations_Tenant_Facility_Code
                UNIQUE (
                    tenant_id,
                    facility_id,
                    code
                ),

            CONSTRAINT FK_ClinicalLocations_Facility
                FOREIGN KEY (
                    tenant_id,
                    facility_id
                )
                REFERENCES HIS.Facilities (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_ClinicalLocations_Parent
                FOREIGN KEY (
                    tenant_id,
                    parent_location_id
                )
                REFERENCES HIS.ClinicalLocations (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_ClinicalLocations_Type
                CHECK (
                    location_type IN (
                        'DEPARTMENT',
                        'UNIT',
                        'WARD',
                        'ROOM',
                        'BAY',
                        'AREA',
                        'OTHER'
                    )
                ),

            CONSTRAINT CK_ClinicalLocations_Status
                CHECK (
                    status IN (
                        'ACTIVE',
                        'INACTIVE'
                    )
                ),

            CONSTRAINT CK_ClinicalLocations_Version
                CHECK (
                    version >= 1
                ),

            CONSTRAINT CK_ClinicalLocations_NotOwnParent
                CHECK (
                    parent_location_id IS NULL
                    OR parent_location_id <> id
                )
        );

        CREATE INDEX IX_ClinicalLocations_Tenant_Facility
            ON HIS.ClinicalLocations (
                tenant_id,
                facility_id,
                status,
                location_type
            );

        CREATE INDEX IX_ClinicalLocations_Tenant_Parent
            ON HIS.ClinicalLocations (
                tenant_id,
                parent_location_id
            )
            WHERE parent_location_id IS NOT NULL;
    END;

    IF OBJECT_ID(
        N'HIS.Beds',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE HIS.Beds
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            facility_id UNIQUEIDENTIFIER NOT NULL,
            location_id UNIQUEIDENTIFIER NOT NULL,

            code NVARCHAR(100) NOT NULL,
            name NVARCHAR(250) NOT NULL,

            bed_type NVARCHAR(30) NOT NULL,
            status NVARCHAR(20) NOT NULL,
            operational_status NVARCHAR(30) NOT NULL,

            description NVARCHAR(1000) NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,

            version INT NOT NULL
                CONSTRAINT DF_Beds_Version
                DEFAULT (1),

            CONSTRAINT PK_Beds
                PRIMARY KEY (id),

            CONSTRAINT UQ_Beds_Tenant_Id
                UNIQUE (tenant_id, id),

            CONSTRAINT UQ_Beds_Tenant_Facility_Code
                UNIQUE (
                    tenant_id,
                    facility_id,
                    code
                ),

            CONSTRAINT FK_Beds_Facility
                FOREIGN KEY (
                    tenant_id,
                    facility_id
                )
                REFERENCES HIS.Facilities (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_Beds_Location
                FOREIGN KEY (
                    tenant_id,
                    location_id
                )
                REFERENCES HIS.ClinicalLocations (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_Beds_Type
                CHECK (
                    bed_type IN (
                        'STANDARD',
                        'ICU',
                        'CCU',
                        'NICU',
                        'PICU',
                        'MATERNITY',
                        'ISOLATION',
                        'BARIATRIC',
                        'PEDIATRIC',
                        'OBSERVATION',
                        'EMERGENCY',
                        'OTHER'
                    )
                ),

            CONSTRAINT CK_Beds_Status
                CHECK (
                    status IN (
                        'ACTIVE',
                        'INACTIVE'
                    )
                ),

            CONSTRAINT CK_Beds_OperationalStatus
                CHECK (
                    operational_status IN (
                        'AVAILABLE',
                        'OCCUPIED',
                        'RESERVED',
                        'CLEANING',
                        'BLOCKED',
                        'MAINTENANCE',
                        'OUT_OF_SERVICE'
                    )
                ),

            CONSTRAINT CK_Beds_Version
                CHECK (
                    version >= 1
                ),

            CONSTRAINT CK_Beds_InactiveNotOccupied
                CHECK (
                    status <> 'INACTIVE'
                    OR operational_status <> 'OCCUPIED'
                )
        );

        CREATE INDEX IX_Beds_Tenant_Location
            ON HIS.Beds (
                tenant_id,
                location_id,
                status,
                operational_status
            );

        CREATE INDEX IX_Beds_Tenant_Facility_Status
            ON HIS.Beds (
                tenant_id,
                facility_id,
                operational_status
            );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;
