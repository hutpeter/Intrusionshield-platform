/*
    EIS — Enterprise Intelligence System
    Telemetry & Energy Service

    Migration:
        003_telemetry_asset_hierarchy.sql

    Purpose:
        Add hierarchical asset support to Telemetry.Assets.

    Model:
        Tenant
          -> Site
              -> Asset
                  -> Child Asset
                      -> Device

    The parent asset relationship is tenant-aware so that an asset
    cannot reference an asset belonging to another tenant.

    SQL Server notes:
        - Dynamic SQL is used for statements that reference the newly
          added parent_asset_id column so that same-batch compilation
          does not fail.
        - QUOTED_IDENTIFIER and related SET options are explicitly
          established because the hierarchy lookup index is filtered.
*/

SET ANSI_NULLS ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET QUOTED_IDENTIFIER ON;
SET NUMERIC_ROUNDABORT OFF;

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /*
        Add parent_asset_id if it does not already exist.
    */
    IF COL_LENGTH(
        'Telemetry.Assets',
        'parent_asset_id'
    ) IS NULL
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE Telemetry.Assets
            ADD parent_asset_id UNIQUEIDENTIFIER NULL;
        ';
    END;

    /*
        Ensure the tenant/id pair is unique.

        This allows the parent relationship to be tenant-aware:

            (tenant_id, parent_asset_id)
                ->
            (tenant_id, id)
    */
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'Telemetry.Assets')
          AND name = N'UX_Telemetry_Assets_Tenant_Id'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            CREATE UNIQUE INDEX UX_Telemetry_Assets_Tenant_Id
                ON Telemetry.Assets
                (
                    tenant_id,
                    id
                );
        ';
    END;

    /*
        Add the tenant-aware self-referencing foreign key.

        This prevents:
            Tenant A child asset
                ->
            Tenant B parent asset
    */
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.foreign_keys
        WHERE parent_object_id = OBJECT_ID(N'Telemetry.Assets')
          AND name = N'FK_Telemetry_Assets_ParentAsset'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            ALTER TABLE Telemetry.Assets
            ADD CONSTRAINT FK_Telemetry_Assets_ParentAsset
                FOREIGN KEY
                (
                    tenant_id,
                    parent_asset_id
                )
                REFERENCES Telemetry.Assets
                (
                    tenant_id,
                    id
                );
        ';
    END;

    /*
        Optimize hierarchy traversal:

            tenant
              + parent asset
                -> child assets

        The index is filtered because root assets have no parent.
    */
    IF NOT EXISTS
    (
        SELECT 1
        FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'Telemetry.Assets')
          AND name = N'IX_Telemetry_Assets_Tenant_ParentAsset'
    )
    BEGIN
        EXEC sys.sp_executesql N'
            SET ANSI_NULLS ON;
            SET ANSI_PADDING ON;
            SET ANSI_WARNINGS ON;
            SET ARITHABORT ON;
            SET CONCAT_NULL_YIELDS_NULL ON;
            SET QUOTED_IDENTIFIER ON;
            SET NUMERIC_ROUNDABORT OFF;

            CREATE INDEX IX_Telemetry_Assets_Tenant_ParentAsset
                ON Telemetry.Assets
                (
                    tenant_id,
                    parent_asset_id
                )
                WHERE parent_asset_id IS NOT NULL;
        ';
    END;

    COMMIT TRANSACTION;

    PRINT 'EIS Telemetry asset hierarchy migration installed successfully.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;