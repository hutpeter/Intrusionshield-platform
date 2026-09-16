SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /*
        Add the telemetry source column if it does not already exist.

        Dynamic SQL is intentionally used here because SQL Server
        compiles a batch before executing ALTER TABLE statements.
        Referencing the newly added column later in the same compiled
        batch would otherwise produce:
            Invalid column name 'source'.
    */

    IF COL_LENGTH(
        N'Telemetry.Readings',
        N'source'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE Telemetry.Readings
            ADD source NVARCHAR(200) NULL;
        ';

        EXEC sys.sp_executesql N'
            UPDATE Telemetry.Readings
            SET source = N''UNKNOWN''
            WHERE source IS NULL;
        ';

        EXEC sys.sp_executesql N'
            ALTER TABLE Telemetry.Readings
            ALTER COLUMN source NVARCHAR(200) NOT NULL;
        ';
    END;

    /*
        Create the source/time-series index if it does not
        already exist.
    */

    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE
            name =
                N'IX_Telemetry_Readings_Tenant_Source_Observed'
            AND object_id =
                OBJECT_ID(N'Telemetry.Readings')
    )
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE INDEX
                IX_Telemetry_Readings_Tenant_Source_Observed
            ON Telemetry.Readings
            (
                tenant_id,
                source,
                observed_at DESC
            );
        ';
    END;

    COMMIT TRANSACTION;

    PRINT
        'Telemetry reading source migration installed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;