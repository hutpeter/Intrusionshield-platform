SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       EIS Telemetry & Energy Foundation
       ============================================================ */

    IF NOT EXISTS (
        SELECT 1
        FROM sys.schemas
        WHERE name = N'Telemetry'
    )
    BEGIN
        EXEC(N'CREATE SCHEMA Telemetry');
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.schemas
        WHERE name = N'Energy'
    )
    BEGIN
        EXEC(N'CREATE SCHEMA Energy');
    END;

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

    /* ============================================================
       Energy.Flows
       ============================================================ */

    IF OBJECT_ID(N'Energy.Flows', N'U') IS NULL
    BEGIN
        CREATE TABLE Energy.Flows
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NOT NULL,

            source_asset_id UNIQUEIDENTIFIER NULL,
            destination_asset_id UNIQUEIDENTIFIER NULL,

            direction NVARCHAR(20) NOT NULL,

            power_kw DECIMAL(28, 10) NULL,
            energy_kwh DECIMAL(28, 10) NULL,

            observed_at DATETIME2(7) NOT NULL,
            created_at DATETIME2(7) NOT NULL,

            CONSTRAINT PK_Energy_Flows
                PRIMARY KEY (id),

            CONSTRAINT FK_Energy_Flows_Site
                FOREIGN KEY (
                    tenant_id,
                    site_id
                )
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_Energy_Flows_SourceAsset
                FOREIGN KEY (
                    tenant_id,
                    site_id,
                    source_asset_id
                )
                REFERENCES Telemetry.Assets (
                    tenant_id,
                    site_id,
                    id
                ),

            CONSTRAINT FK_Energy_Flows_DestinationAsset
                FOREIGN KEY (
                    tenant_id,
                    site_id,
                    destination_asset_id
                )
                REFERENCES Telemetry.Assets (
                    tenant_id,
                    site_id,
                    id
                ),

            CONSTRAINT CK_Energy_Flows_Direction
                CHECK (direction IN (
                    N'PRODUCTION',
                    N'CONSUMPTION',
                    N'IMPORT',
                    N'EXPORT',
                    N'CHARGE',
                    N'DISCHARGE',
                    N'TRANSFER'
                )),

            CONSTRAINT CK_Energy_Flows_Value
                CHECK (
                    power_kw IS NOT NULL OR
                    energy_kwh IS NOT NULL
                )
        );

        CREATE INDEX IX_Energy_Flows_Tenant_Site_Observed
            ON Energy.Flows (
                tenant_id,
                site_id,
                observed_at DESC
            );
    END;

    /* ============================================================
       Energy.AlarmRules
       ============================================================ */

    IF OBJECT_ID(N'Energy.AlarmRules', N'U') IS NULL
    BEGIN
        CREATE TABLE Energy.AlarmRules
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NULL,

            name NVARCHAR(200) NOT NULL,
            description NVARCHAR(1000) NULL,

            measurement_code NVARCHAR(200) NOT NULL,
            operator NVARCHAR(10) NOT NULL,
            threshold_value DECIMAL(28, 10) NOT NULL,

            severity NVARCHAR(20) NOT NULL,
            enabled BIT NOT NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,
            version INT NOT NULL,

            CONSTRAINT PK_Energy_AlarmRules
                PRIMARY KEY (id),

            CONSTRAINT UQ_Energy_AlarmRules_Tenant_Id
                UNIQUE (tenant_id, id),

            CONSTRAINT FK_Energy_AlarmRules_Site
                FOREIGN KEY (
                    tenant_id,
                    site_id
                )
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_Energy_AlarmRules_Operator
                CHECK (operator IN (
                    N'GT',
                    N'GTE',
                    N'LT',
                    N'LTE',
                    N'EQ',
                    N'NEQ'
                )),

            CONSTRAINT CK_Energy_AlarmRules_Severity
                CHECK (severity IN (
                    N'INFO',
                    N'WARNING',
                    N'CRITICAL'
                )),

            CONSTRAINT CK_Energy_AlarmRules_Version
                CHECK (version >= 1)
        );
    END;

    /* ============================================================
       Energy.AlarmEvents
       ============================================================ */

    IF OBJECT_ID(N'Energy.AlarmEvents', N'U') IS NULL
    BEGIN
        CREATE TABLE Energy.AlarmEvents
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NOT NULL,

            asset_id UNIQUEIDENTIFIER NULL,
            device_id UNIQUEIDENTIFIER NULL,
            rule_id UNIQUEIDENTIFIER NULL,

            measurement_code NVARCHAR(200) NOT NULL,

            severity NVARCHAR(20) NOT NULL,
            state NVARCHAR(20) NOT NULL,

            message NVARCHAR(1000) NOT NULL,

            observed_value DECIMAL(28, 10) NULL,
            threshold_value DECIMAL(28, 10) NULL,

            occurred_at DATETIME2(7) NOT NULL,
            acknowledged_at DATETIME2(7) NULL,
            resolved_at DATETIME2(7) NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,

            CONSTRAINT PK_Energy_AlarmEvents
                PRIMARY KEY (id),

            CONSTRAINT FK_Energy_AlarmEvents_Site
                FOREIGN KEY (
                    tenant_id,
                    site_id
                )
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_Energy_AlarmEvents_Asset
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

            /*
             * Device is also constrained to the event's site.
             */
            CONSTRAINT FK_Energy_AlarmEvents_Device
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

            CONSTRAINT FK_Energy_AlarmEvents_Rule
                FOREIGN KEY (
                    tenant_id,
                    rule_id
                )
                REFERENCES Energy.AlarmRules (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_Energy_AlarmEvents_Severity
                CHECK (severity IN (
                    N'INFO',
                    N'WARNING',
                    N'CRITICAL'
                )),

            CONSTRAINT CK_Energy_AlarmEvents_State
                CHECK (state IN (
                    N'OPEN',
                    N'ACKNOWLEDGED',
                    N'RESOLVED'
                )),

            CONSTRAINT CK_Energy_AlarmEvents_Timestamps
                CHECK (
                    (
                        acknowledged_at IS NULL OR
                        acknowledged_at >= occurred_at
                    )
                    AND
                    (
                        resolved_at IS NULL OR
                        resolved_at >= occurred_at
                    )
                )
        );

        CREATE INDEX IX_Energy_AlarmEvents_Tenant_Site_State_Occurred
            ON Energy.AlarmEvents (
                tenant_id,
                site_id,
                state,
                occurred_at DESC
            );
    END;

    /* ============================================================
       Energy.PerformanceMetrics
       ============================================================ */

    IF OBJECT_ID(N'Energy.PerformanceMetrics', N'U') IS NULL
    BEGIN
        CREATE TABLE Energy.PerformanceMetrics
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NOT NULL,
            asset_id UNIQUEIDENTIFIER NULL,

            metric_code NVARCHAR(200) NOT NULL,
            metric_value DECIMAL(28, 10) NOT NULL,
            unit NVARCHAR(50) NULL,

            period_start DATETIME2(7) NOT NULL,
            period_end DATETIME2(7) NOT NULL,

            calculated_at DATETIME2(7) NOT NULL,
            created_at DATETIME2(7) NOT NULL,

            CONSTRAINT PK_Energy_PerformanceMetrics
                PRIMARY KEY (id),

            CONSTRAINT FK_Energy_PerformanceMetrics_Site
                FOREIGN KEY (
                    tenant_id,
                    site_id
                )
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_Energy_PerformanceMetrics_Asset
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

            CONSTRAINT CK_Energy_PerformanceMetrics_Period
                CHECK (period_end >= period_start)
        );

        CREATE INDEX IX_Energy_PerformanceMetrics_Tenant_Site_Period
            ON Energy.PerformanceMetrics (
                tenant_id,
                site_id,
                period_start DESC,
                period_end DESC
            );
    END;

    COMMIT TRANSACTION;

    PRINT 'EIS Telemetry & Energy foundation installed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;