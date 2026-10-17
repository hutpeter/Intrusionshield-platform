SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /* ============================================================
       Ruby Telemetry Storage Policies

       Controls how frequently incoming telemetry observations are
       persisted to durable storage.

       Policy precedence:

           MEASUREMENT
               ↓
           DEVICE
               ↓
           SITE
               ↓
           TENANT
               ↓
           Ruby platform default

       Ruby's initial platform default is one persisted observation
       per device / measurement every 60 seconds.

       Real-time acquisition and durable-storage cadence are
       intentionally independent.
       ============================================================ */

    IF NOT EXISTS (
        SELECT 1
        FROM sys.schemas
        WHERE name = N'Telemetry'
    )
    BEGIN
        EXEC(N'CREATE SCHEMA Telemetry');
    END;

    /* ============================================================
       Telemetry.StoragePolicies
       ============================================================ */

    IF OBJECT_ID(
        N'Telemetry.StoragePolicies',
        N'U'
    ) IS NULL
    BEGIN
        CREATE TABLE Telemetry.StoragePolicies
        (
            id UNIQUEIDENTIFIER NOT NULL,
            tenant_id UNIQUEIDENTIFIER NOT NULL,

            scope_type NVARCHAR(30) NOT NULL,

            site_id UNIQUEIDENTIFIER NULL,
            device_id UNIQUEIDENTIFIER NULL,
            measurement_definition_id UNIQUEIDENTIFIER NULL,

            enabled BIT NOT NULL,

            storage_interval_seconds INT NOT NULL,

            created_by NVARCHAR(250) NOT NULL,
            updated_by NVARCHAR(250) NOT NULL,

            created_at DATETIME2(7) NOT NULL,
            updated_at DATETIME2(7) NOT NULL,

            version INT NOT NULL,

            CONSTRAINT PK_Telemetry_StoragePolicies
                PRIMARY KEY (id),

            CONSTRAINT UQ_Telemetry_StoragePolicies_Tenant_Id
                UNIQUE (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_Telemetry_StoragePolicies_Site
                FOREIGN KEY (
                    tenant_id,
                    site_id
                )
                REFERENCES Telemetry.Sites (
                    tenant_id,
                    id
                ),

            CONSTRAINT FK_Telemetry_StoragePolicies_Device
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

            CONSTRAINT FK_Telemetry_StoragePolicies_MeasurementDefinition
                FOREIGN KEY (
                    tenant_id,
                    measurement_definition_id
                )
                REFERENCES Telemetry.MeasurementDefinitions (
                    tenant_id,
                    id
                ),

            CONSTRAINT CK_Telemetry_StoragePolicies_ScopeType
                CHECK (
                    scope_type IN (
                        N'TENANT',
                        N'SITE',
                        N'DEVICE',
                        N'MEASUREMENT'
                    )
                ),

            /*
             * TENANT:
             *   No subordinate identifiers.
             *
             * SITE:
             *   site_id only.
             *
             * DEVICE:
             *   site_id + device_id.
             *
             * MEASUREMENT:
             *   measurement_definition_id with optional site/device
             *   context.
             *
             * A measurement policy may therefore apply tenant-wide,
             * to a measurement at one site, or to one device point.
             */
            CONSTRAINT CK_Telemetry_StoragePolicies_Scope
                CHECK (
                    (
                        scope_type = N'TENANT'
                        AND site_id IS NULL
                        AND device_id IS NULL
                        AND measurement_definition_id IS NULL
                    )
                    OR
                    (
                        scope_type = N'SITE'
                        AND site_id IS NOT NULL
                        AND device_id IS NULL
                        AND measurement_definition_id IS NULL
                    )
                    OR
                    (
                        scope_type = N'DEVICE'
                        AND site_id IS NOT NULL
                        AND device_id IS NOT NULL
                        AND measurement_definition_id IS NULL
                    )
                    OR
                    (
                        scope_type = N'MEASUREMENT'
                        AND measurement_definition_id IS NOT NULL
                        AND (
                            (
                                site_id IS NULL
                                AND device_id IS NULL
                            )
                            OR
                            (
                                site_id IS NOT NULL
                                AND device_id IS NULL
                            )
                            OR
                            (
                                site_id IS NOT NULL
                                AND device_id IS NOT NULL
                            )
                        )
                    )
                ),

            /*
             * Initial supported durable-storage cadence:
             *
             * minimum: 1 second
             * maximum: 7 days
             *
             * This is intentionally separate from acquisition /
             * display frequency.
             */
            CONSTRAINT CK_Telemetry_StoragePolicies_Interval
                CHECK (
                    storage_interval_seconds
                    BETWEEN 1 AND 604800
                ),

            CONSTRAINT CK_Telemetry_StoragePolicies_Version
                CHECK (
                    version >= 1
                )
        );

        /*
         * Only one tenant-level policy per tenant.
         */
        CREATE UNIQUE INDEX
            UX_Telemetry_StoragePolicies_Tenant
            ON Telemetry.StoragePolicies (
                tenant_id
            )
            WHERE
                scope_type = N'TENANT';

        /*
         * Only one site-level policy per site.
         */
        CREATE UNIQUE INDEX
            UX_Telemetry_StoragePolicies_Site
            ON Telemetry.StoragePolicies (
                tenant_id,
                site_id
            )
            WHERE
                scope_type = N'SITE';

        /*
         * Only one device-level policy per device.
         */
        CREATE UNIQUE INDEX
            UX_Telemetry_StoragePolicies_Device
            ON Telemetry.StoragePolicies (
                tenant_id,
                site_id,
                device_id
            )
            WHERE
                scope_type = N'DEVICE';

        /*
         * Tenant-wide measurement override.
         */
        CREATE UNIQUE INDEX
            UX_Telemetry_StoragePolicies_Measurement_Tenant
            ON Telemetry.StoragePolicies (
                tenant_id,
                measurement_definition_id
            )
            WHERE
                scope_type = N'MEASUREMENT'
                AND site_id IS NULL
                AND device_id IS NULL;

        /*
         * Site-specific measurement override.
         */
        CREATE UNIQUE INDEX
            UX_Telemetry_StoragePolicies_Measurement_Site
            ON Telemetry.StoragePolicies (
                tenant_id,
                site_id,
                measurement_definition_id
            )
            WHERE
                scope_type = N'MEASUREMENT'
                AND site_id IS NOT NULL
                AND device_id IS NULL;

        /*
         * Device-point-specific measurement override.
         */
        CREATE UNIQUE INDEX
            UX_Telemetry_StoragePolicies_Measurement_Device
            ON Telemetry.StoragePolicies (
                tenant_id,
                site_id,
                device_id,
                measurement_definition_id
            )
            WHERE
                scope_type = N'MEASUREMENT'
                AND site_id IS NOT NULL
                AND device_id IS NOT NULL;

        /*
         * Supports effective-policy resolution.
         */
        CREATE INDEX
            IX_Telemetry_StoragePolicies_Resolution
            ON Telemetry.StoragePolicies (
                tenant_id,
                scope_type,
                site_id,
                device_id,
                measurement_definition_id
            )
            INCLUDE (
                enabled,
                storage_interval_seconds,
                version
            );

        /*
         * Supports administrative policy listing.
         */
        CREATE INDEX
            IX_Telemetry_StoragePolicies_Tenant_Updated
            ON Telemetry.StoragePolicies (
                tenant_id,
                updated_at DESC
            );
    END;

    COMMIT TRANSACTION;

    PRINT 'Ruby telemetry storage policies installed successfully.';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    THROW;
END CATCH;