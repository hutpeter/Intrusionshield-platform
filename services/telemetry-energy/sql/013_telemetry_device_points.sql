/* Ruby Telemetry Device Point Registry — additive migration.
   REVIEW ONLY: apply to a backed-up DEVELOPMENT database after review.
   Does not change existing readings or devices. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'Telemetry.Devices', N'U') IS NULL
        THROW 51101, 'Telemetry.Devices is missing.', 1;
    IF OBJECT_ID(N'Telemetry.MeasurementDefinitions', N'U') IS NULL
        THROW 51102, 'Telemetry.MeasurementDefinitions is missing.', 1;

    IF OBJECT_ID(N'Telemetry.DevicePoints', N'U') IS NULL
    BEGIN
        CREATE TABLE Telemetry.DevicePoints (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,
            site_id UNIQUEIDENTIFIER NOT NULL,
            device_id UNIQUEIDENTIFIER NOT NULL,
            measurement_definition_id UNIQUEIDENTIFIER NOT NULL,
            code NVARCHAR(100) NOT NULL,
            name NVARCHAR(200) NOT NULL,
            description NVARCHAR(1000) NULL,
            enabled BIT NOT NULL CONSTRAINT DF_Telemetry_DevicePoints_Enabled DEFAULT (1),
            poll_interval_seconds INT NULL,
            protocol_address NVARCHAR(250) NULL,
            protocol_configuration NVARCHAR(MAX) NULL,
            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,
            version INT NOT NULL,
            CONSTRAINT PK_Telemetry_DevicePoints PRIMARY KEY (id),
            CONSTRAINT UQ_Telemetry_DevicePoints_Tenant_Id UNIQUE (tenant_id, id),
            CONSTRAINT UQ_Telemetry_DevicePoints_Tenant_Device_Code UNIQUE (tenant_id, device_id, code),
            CONSTRAINT FK_Telemetry_DevicePoints_Device FOREIGN KEY (tenant_id, site_id, device_id)
                REFERENCES Telemetry.Devices (tenant_id, site_id, id),
            CONSTRAINT FK_Telemetry_DevicePoints_Measurement FOREIGN KEY (tenant_id, measurement_definition_id)
                REFERENCES Telemetry.MeasurementDefinitions (tenant_id, id),
            CONSTRAINT CK_Telemetry_DevicePoints_Poll CHECK (poll_interval_seconds IS NULL OR poll_interval_seconds BETWEEN 1 AND 86400),
            CONSTRAINT CK_Telemetry_DevicePoints_Version CHECK (version >= 1),
            CONSTRAINT CK_Telemetry_DevicePoints_ProtocolJson CHECK (protocol_configuration IS NULL OR ISJSON(protocol_configuration) = 1)
        );
        CREATE INDEX IX_Telemetry_DevicePoints_Tenant_Site_Device
            ON Telemetry.DevicePoints (tenant_id, site_id, device_id);
    END;
    COMMIT TRANSACTION;
    PRINT 'Ruby Telemetry DevicePoints migration verified.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
