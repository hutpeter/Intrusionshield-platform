SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF SCHEMA_ID(N'Telemetry') IS NULL EXEC(N'CREATE SCHEMA Telemetry');

    /* ============================================================
       Telemetry.Sites
       ============================================================ */

    IF OBJECT_ID(N'Telemetry.Sites', N'U') IS NULL
    BEGIN
        CREATE TABLE Telemetry.Sites
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,

            code NVARCHAR(100) NOT NULL,
            name NVARCHAR(200) NOT NULL,
            description NVARCHAR(1000) NULL,
            timezone NVARCHAR(100) NULL,

            latitude DECIMAL(9, 6) NULL,
            longitude DECIMAL(9, 6) NULL,

            status NVARCHAR(20) NOT NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,
            version INT NOT NULL,

            CONSTRAINT PK_Telemetry_Sites
                PRIMARY KEY (id),

            CONSTRAINT UQ_Telemetry_Sites_Tenant_Id
                UNIQUE (tenant_id, id),

            CONSTRAINT UQ_Telemetry_Sites_Tenant_Code
                UNIQUE (tenant_id, code),

            CONSTRAINT CK_Telemetry_Sites_Status
                CHECK (status IN (
                    N'ACTIVE',
                    N'INACTIVE'
                )),

            CONSTRAINT CK_Telemetry_Sites_Latitude
                CHECK (
                    latitude IS NULL OR
                    latitude BETWEEN -90 AND 90
                ),

            CONSTRAINT CK_Telemetry_Sites_Longitude
                CHECK (
                    longitude IS NULL OR
                    longitude BETWEEN -180 AND 180
                ),

            CONSTRAINT CK_Telemetry_Sites_Version
                CHECK (version >= 1)
        );
    END;

    /* ============================================================
       Telemetry.Assets
       ============================================================ */

    IF OBJECT_ID(N'Telemetry.Assets', N'U') IS NULL
    BEGIN
        CREATE TABLE Telemetry.Assets
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NOT NULL,

            code NVARCHAR(100) NOT NULL,
            name NVARCHAR(200) NOT NULL,
            asset_type NVARCHAR(100) NOT NULL,
            description NVARCHAR(1000) NULL,

            manufacturer NVARCHAR(200) NULL,
            model NVARCHAR(200) NULL,
            serial_number NVARCHAR(200) NULL,

            status NVARCHAR(20) NOT NULL,

            installed_at DATETIME2(7) NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,
            version INT NOT NULL,

            CONSTRAINT PK_Telemetry_Assets
                PRIMARY KEY (id),

            CONSTRAINT UQ_Telemetry_Assets_Tenant_Id
                UNIQUE (tenant_id, id),

            /*
             * This key allows child tables to enforce both tenant
             * and site ownership when referencing an asset.
             */
            CONSTRAINT UQ_Telemetry_Assets_Tenant_Site_Id
                UNIQUE (tenant_id, site_id, id),

            CONSTRAINT UQ_Telemetry_Assets_Tenant_Site_Code
                UNIQUE (tenant_id, site_id, code),

            CONSTRAINT FK_Telemetry_Assets_Site
                FOREIGN KEY (tenant_id, site_id)
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_Telemetry_Assets_Status
                CHECK (status IN (
                    N'ACTIVE',
                    N'INACTIVE',
                    N'MAINTENANCE',
                    N'RETIRED'
                )),

            CONSTRAINT CK_Telemetry_Assets_Version
                CHECK (version >= 1)
        );
    END;

    /* ============================================================
       Telemetry.Devices
       ============================================================ */

    IF OBJECT_ID(N'Telemetry.Devices', N'U') IS NULL
    BEGIN
        CREATE TABLE Telemetry.Devices
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NOT NULL,
            asset_id UNIQUEIDENTIFIER NULL,

            code NVARCHAR(100) NOT NULL,
            name NVARCHAR(200) NOT NULL,
            device_type NVARCHAR(100) NOT NULL,

            manufacturer NVARCHAR(200) NULL,
            model NVARCHAR(200) NULL,
            serial_number NVARCHAR(200) NULL,

            protocol NVARCHAR(100) NULL,
            external_identifier NVARCHAR(250) NULL,

            status NVARCHAR(20) NOT NULL,

            last_seen_at DATETIME2(7) NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,
            version INT NOT NULL,

            CONSTRAINT PK_Telemetry_Devices
                PRIMARY KEY (id),

            CONSTRAINT UQ_Telemetry_Devices_Tenant_Id
                UNIQUE (tenant_id, id),

            /*
             * Critical for site-safe telemetry relationships.
             */
            CONSTRAINT UQ_Telemetry_Devices_Tenant_Site_Id
                UNIQUE (tenant_id, site_id, id),

            CONSTRAINT UQ_Telemetry_Devices_Tenant_Site_Code
                UNIQUE (tenant_id, site_id, code),

            CONSTRAINT FK_Telemetry_Devices_Site
                FOREIGN KEY (tenant_id, site_id)
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_Telemetry_Devices_Asset
                FOREIGN KEY (
                    tenant_id,
                    site_id,
                    asset_id
                )
                REFERENCES Telemetry.Assets (
                    tenant_id,
                    site_id,
                    id
                ),

            CONSTRAINT CK_Telemetry_Devices_Status
                CHECK (status IN (
                    N'ONLINE',
                    N'OFFLINE',
                    N'DEGRADED',
                    N'MAINTENANCE',
                    N'RETIRED'
                )),

            CONSTRAINT CK_Telemetry_Devices_Version
                CHECK (version >= 1)
        );
    END;

    /* ============================================================
       Telemetry.MeasurementDefinitions
       ============================================================ */

    IF OBJECT_ID(
        N'Telemetry.MeasurementDefinitions',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE Telemetry.MeasurementDefinitions
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,

            code NVARCHAR(200) NOT NULL,
            name NVARCHAR(200) NOT NULL,
            description NVARCHAR(1000) NULL,

            unit NVARCHAR(50) NULL,
            data_type NVARCHAR(20) NOT NULL,

            minimum_value DECIMAL(28, 10) NULL,
            maximum_value DECIMAL(28, 10) NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,
            version INT NOT NULL,

            CONSTRAINT PK_Telemetry_MeasurementDefinitions
                PRIMARY KEY (id),

            CONSTRAINT UQ_Telemetry_MeasurementDefinitions_Tenant_Id
                UNIQUE (tenant_id, id),

            CONSTRAINT UQ_Telemetry_MeasurementDefinitions_Tenant_Code
                UNIQUE (tenant_id, code),

            CONSTRAINT CK_Telemetry_MeasurementDefinitions_DataType
                CHECK (data_type IN (
                    N'NUMBER',
                    N'BOOLEAN',
                    N'STRING'
                )),

            CONSTRAINT CK_Telemetry_MeasurementDefinitions_Range
                CHECK (
                    minimum_value IS NULL OR
                    maximum_value IS NULL OR
                    minimum_value <= maximum_value
                ),

            CONSTRAINT CK_Telemetry_MeasurementDefinitions_Version
                CHECK (version >= 1)
        );
    END;

    /* ============================================================
       Telemetry.Readings
       ============================================================ */

    IF OBJECT_ID(N'Telemetry.Readings', N'U') IS NULL
    BEGIN
        CREATE TABLE Telemetry.Readings
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NOT NULL,
            device_id UNIQUEIDENTIFIER NOT NULL,
            measurement_definition_id UNIQUEIDENTIFIER NOT NULL,

            observed_at DATETIME2(7) NOT NULL,
            received_at DATETIME2(7) NOT NULL,

            numeric_value DECIMAL(28, 10) NULL,
            boolean_value BIT NULL,
            string_value NVARCHAR(2000) NULL,

            quality NVARCHAR(20) NOT NULL,

            source_sequence BIGINT NULL,

            CONSTRAINT PK_Telemetry_Readings
                PRIMARY KEY (id),

            CONSTRAINT FK_Telemetry_Readings_Site
                FOREIGN KEY (
                    tenant_id,
                    site_id
                )
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            /*
             * A reading cannot reference a device belonging to
             * another site in the same tenant.
             */
            CONSTRAINT FK_Telemetry_Readings_Device
                FOREIGN KEY (
                    tenant_id,
                    site_id,
                    device_id
                )
                REFERENCES Telemetry.Devices (
                    tenant_id,
                    site_id,
                    id
                ),

            CONSTRAINT FK_Telemetry_Readings_MeasurementDefinition
                FOREIGN KEY (
                    tenant_id,
                    measurement_definition_id
                )
                REFERENCES Telemetry.MeasurementDefinitions (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_Telemetry_Readings_Quality
                CHECK (quality IN (
                    N'GOOD',
                    N'UNCERTAIN',
                    N'BAD',
                    N'MISSING'
                )),

            /*
             * Exactly one typed value must be populated.
             */
            CONSTRAINT CK_Telemetry_Readings_ExactlyOneValue
                CHECK (
                    (
                        CASE
                            WHEN numeric_value IS NOT NULL
                            THEN 1 ELSE 0
                        END
                    ) +
                    (
                        CASE
                            WHEN boolean_value IS NOT NULL
                            THEN 1 ELSE 0
                        END
                    ) +
                    (
                        CASE
                            WHEN string_value IS NOT NULL
                            THEN 1 ELSE 0
                        END
                    ) = 1
                )
        );

        CREATE INDEX IX_Telemetry_Readings_Tenant_Site_Observed
            ON Telemetry.Readings (
                tenant_id,
                site_id,
                observed_at DESC
            );

        CREATE INDEX IX_Telemetry_Readings_Device_Measurement_Observed
            ON Telemetry.Readings (
                tenant_id,
                device_id,
                measurement_definition_id,
                observed_at DESC
            );

        CREATE INDEX IX_Telemetry_Readings_Received
            ON Telemetry.Readings (
                tenant_id,
                received_at DESC
            );
    END;

    COMMIT TRANSACTION;
    PRINT 'Ruby Telemetry isolated foundation installed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
