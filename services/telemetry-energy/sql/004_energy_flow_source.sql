SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(
        N'Energy.Flows',
        N'source'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE Energy.Flows
            ADD source NVARCHAR(200) NULL;
        ';

        EXEC sys.sp_executesql N'
            UPDATE Energy.Flows
            SET source = N''legacy''
            WHERE source IS NULL;
        ';

        EXEC sys.sp_executesql N'
            ALTER TABLE Energy.Flows
            ALTER COLUMN source NVARCHAR(200) NOT NULL;
        ';
    END;

    COMMIT TRANSACTION;

    PRINT 'Energy flow source migration installed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;