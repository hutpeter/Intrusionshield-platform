SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('Energy.PerformanceMetrics', 'source') IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE Energy.PerformanceMetrics
            ADD source NVARCHAR(200) NULL;
        ';

        EXEC sys.sp_executesql N'
            UPDATE Energy.PerformanceMetrics
            SET source = N''legacy''
            WHERE source IS NULL;
        ';

        EXEC sys.sp_executesql N'
            ALTER TABLE Energy.PerformanceMetrics
            ALTER COLUMN source NVARCHAR(200) NOT NULL;
        ';
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'IX_Energy_PerformanceMetrics_Tenant_Site_Code_Period'
          AND object_id = OBJECT_ID('Energy.PerformanceMetrics')
    )
    BEGIN
        CREATE INDEX IX_Energy_PerformanceMetrics_Tenant_Site_Code_Period
            ON Energy.PerformanceMetrics
            (
                tenant_id,
                site_id,
                metric_code,
                period_end DESC
            );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
