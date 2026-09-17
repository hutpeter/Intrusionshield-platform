/*
 * EIS Telemetry & Energy
 * Migration 005 - Alerts and performance domain alignment
 *
 * SQL Server note:
 * Dynamic SQL is intentionally used for statements that reference
 * columns added by this migration. SQL Server compiles an entire
 * batch before executing ALTER TABLE statements, so referencing a
 * newly added column later in the same batch can otherwise produce
 * "Invalid column name" errors.
 */

SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       Energy.AlarmRules
       ============================================================ */

    IF COL_LENGTH(
        N'Energy.AlarmRules',
        N'duration_seconds'
    ) IS NULL
    BEGIN
        ALTER TABLE Energy.AlarmRules
            ADD duration_seconds INT NOT NULL
                CONSTRAINT DF_Energy_AlarmRules_DurationSeconds
                DEFAULT (0);
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name =
            N'CK_Energy_AlarmRules_DurationSeconds'
          AND parent_object_id =
            OBJECT_ID(N'Energy.AlarmRules')
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE Energy.AlarmRules
                ADD CONSTRAINT
                    CK_Energy_AlarmRules_DurationSeconds
                CHECK (duration_seconds >= 0);
        ';
    END;

    /* ============================================================
       Energy.AlarmEvents
       ============================================================ */

    IF COL_LENGTH(
        N'Energy.AlarmEvents',
        N'title'
    ) IS NULL
    BEGIN
        ALTER TABLE Energy.AlarmEvents
            ADD title NVARCHAR(200) NULL;
    END;

    IF COL_LENGTH(
        N'Energy.AlarmEvents',
        N'source'
    ) IS NULL
    BEGIN
        ALTER TABLE Energy.AlarmEvents
            ADD source NVARCHAR(200) NULL;
    END;

    IF COL_LENGTH(
        N'Energy.AlarmEvents',
        N'acknowledged_by'
    ) IS NULL
    BEGIN
        ALTER TABLE Energy.AlarmEvents
            ADD acknowledged_by NVARCHAR(200) NULL;
    END;

    IF COL_LENGTH(
        N'Energy.AlarmEvents',
        N'resolved_by'
    ) IS NULL
    BEGIN
        ALTER TABLE Energy.AlarmEvents
            ADD resolved_by NVARCHAR(200) NULL;
    END;

    IF COL_LENGTH(
        N'Energy.AlarmEvents',
        N'version'
    ) IS NULL
    BEGIN
        ALTER TABLE Energy.AlarmEvents
            ADD version INT NOT NULL
                CONSTRAINT DF_Energy_AlarmEvents_Version
                DEFAULT (1);
    END;

    /*
     * Use dynamic SQL because title and source may have been
     * introduced above in this same migration.
     */
    EXEC sys.sp_executesql N'
        UPDATE Energy.AlarmEvents
        SET
            title = COALESCE(
                title,
                N''Energy alarm''
            ),
            source = COALESCE(
                source,
                N''legacy''
            )
        WHERE
            title IS NULL
            OR source IS NULL;
    ';

    EXEC sys.sp_executesql N'
        ALTER TABLE Energy.AlarmEvents
            ALTER COLUMN title
                NVARCHAR(200) NOT NULL;
    ';

    EXEC sys.sp_executesql N'
        ALTER TABLE Energy.AlarmEvents
            ALTER COLUMN source
                NVARCHAR(200) NOT NULL;
    ';

    /*
     * The Energy domain allows measurementCode to be absent
     * for alarm events that are not tied directly to one
     * measurement.
     */
    ALTER TABLE Energy.AlarmEvents
        ALTER COLUMN measurement_code
            NVARCHAR(200) NULL;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name =
            N'CK_Energy_AlarmEvents_Version'
          AND parent_object_id =
            OBJECT_ID(N'Energy.AlarmEvents')
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE Energy.AlarmEvents
                ADD CONSTRAINT
                    CK_Energy_AlarmEvents_Version
                CHECK (version >= 1);
        ';
    END;

    /* ============================================================
       Alarm indexes
       ============================================================ */

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id =
            OBJECT_ID(N'Energy.AlarmEvents')
          AND name =
            N'IX_Energy_AlarmEvents_Tenant_Site_State_Occurred'
    )
    BEGIN
        CREATE INDEX
            IX_Energy_AlarmEvents_Tenant_Site_State_Occurred
        ON Energy.AlarmEvents
        (
            tenant_id,
            site_id,
            state,
            occurred_at DESC
        );
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id =
            OBJECT_ID(N'Energy.AlarmRules')
          AND name =
            N'IX_Energy_AlarmRules_Tenant_Site_Enabled'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE INDEX
                IX_Energy_AlarmRules_Tenant_Site_Enabled
            ON Energy.AlarmRules
            (
                tenant_id,
                site_id,
                enabled,
                measurement_code
            );
        ';
    END;

    /* ============================================================
       Performance metric indexes
       ============================================================ */

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE object_id =
            OBJECT_ID(N'Energy.PerformanceMetrics')
          AND name =
            N'IX_Energy_PerformanceMetrics_Tenant_Site_Period'
    )
    BEGIN
        CREATE INDEX
            IX_Energy_PerformanceMetrics_Tenant_Site_Period
        ON Energy.PerformanceMetrics
        (
            tenant_id,
            site_id,
            period_end DESC,
            metric_code
        );
    END;

    COMMIT TRANSACTION;

    PRINT N'Migration 005 completed successfully.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;