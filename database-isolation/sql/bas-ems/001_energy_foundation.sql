SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF SCHEMA_ID(N'Energy') IS NULL EXEC(N'CREATE SCHEMA Energy');

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

            /* External Telemetry reference validated by service boundary: FK_Energy_Flows_Site */

            /* External Telemetry reference validated by service boundary: FK_Energy_Flows_SourceAsset */

            /* External Telemetry reference validated by service boundary: FK_Energy_Flows_DestinationAsset */

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

            /* External Telemetry reference validated by service boundary: FK_Energy_AlarmRules_Site */

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

            /* External Telemetry reference validated by service boundary: FK_Energy_AlarmEvents_Site */

            /* External Telemetry reference validated by service boundary: FK_Energy_AlarmEvents_Asset */

            /*
             * Device is also constrained to the event's site.
             */
            /* External Telemetry reference validated by service boundary: FK_Energy_AlarmEvents_Device */

            /* External Telemetry reference validated by service boundary: FK_Energy_AlarmEvents_Rule */

            /* External Telemetry reference validated by service boundary: FK_Energy_PerformanceMetrics_Asset */

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
    PRINT 'Ruby BAS/EMS isolated foundation installed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
