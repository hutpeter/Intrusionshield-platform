/*
    Ruby shared Administrative Region / Service Area configuration.

    Tenant-configurable items introduced here belong to the Ruby Tenant
    Configuration Catalog and will later be administered through the
    onboarding / Tenant Configuration GUI.
*/

IF OBJECT_ID('Platform.AdministrativeRegions', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.AdministrativeRegions (
        country_code char(2) NOT NULL,
        code varchar(40) NOT NULL,
        name nvarchar(160) NOT NULL,
        region_type nvarchar(80) NULL,
        status varchar(20) NOT NULL
            CONSTRAINT DF_AdministrativeRegions_Status DEFAULT 'ACTIVE',
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_AdministrativeRegions_Created DEFAULT SYSUTCDATETIME(),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_AdministrativeRegions_Updated DEFAULT SYSUTCDATETIME(),
        version int NOT NULL
            CONSTRAINT DF_AdministrativeRegions_Version DEFAULT 1,
        CONSTRAINT PK_AdministrativeRegions PRIMARY KEY (country_code, code),
        CONSTRAINT FK_AdministrativeRegions_Country
            FOREIGN KEY (country_code) REFERENCES Platform.Countries(code),
        CONSTRAINT CK_AdministrativeRegions_Status
            CHECK (status IN ('ACTIVE','INACTIVE'))
    );
END;
GO

IF OBJECT_ID('Platform.TenantAdministrativeRegions', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.TenantAdministrativeRegions (
        tenant_id uniqueidentifier NOT NULL,
        country_code char(2) NOT NULL,
        region_code varchar(40) NOT NULL,
        enabled bit NOT NULL
            CONSTRAINT DF_TenantAdministrativeRegions_Enabled DEFAULT 1,
        display_order int NOT NULL
            CONSTRAINT DF_TenantAdministrativeRegions_Order DEFAULT 100,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_TenantAdministrativeRegions_Created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_TenantAdministrativeRegions
            PRIMARY KEY (tenant_id, country_code, region_code),
        CONSTRAINT FK_TenantAdministrativeRegions_Region
            FOREIGN KEY (country_code, region_code)
            REFERENCES Platform.AdministrativeRegions(country_code, code)
    );
END;
GO

IF OBJECT_ID('Platform.ServiceAreas', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.ServiceAreas (
        id uniqueidentifier NOT NULL
            CONSTRAINT DF_ServiceAreas_Id DEFAULT NEWID(),
        tenant_id uniqueidentifier NOT NULL,
        country_code char(2) NOT NULL,
        region_code varchar(40) NOT NULL,
        code varchar(60) NOT NULL,
        name nvarchar(160) NOT NULL,
        enabled bit NOT NULL
            CONSTRAINT DF_ServiceAreas_Enabled DEFAULT 1,
        display_order int NOT NULL
            CONSTRAINT DF_ServiceAreas_Order DEFAULT 100,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_ServiceAreas_Created DEFAULT SYSUTCDATETIME(),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_ServiceAreas_Updated DEFAULT SYSUTCDATETIME(),
        version int NOT NULL
            CONSTRAINT DF_ServiceAreas_Version DEFAULT 1,
        CONSTRAINT PK_ServiceAreas PRIMARY KEY (id),
        CONSTRAINT UQ_ServiceAreas_TenantCode UNIQUE (tenant_id, code),
        CONSTRAINT FK_ServiceAreas_Region
            FOREIGN KEY (country_code, region_code)
            REFERENCES Platform.AdministrativeRegions(country_code, code)
    );
END;
GO

/*
    Small reference seed needed by the current development tenant.
    This is intentionally not a giant global city/region database.
    Additional regions are enabled by an administrator during onboarding.
*/
MERGE Platform.AdministrativeRegions AS target
USING (VALUES
    ('CA','ON','Ontario','Province'),
    ('US','FL','Florida','State'),
    ('GB','ENG','England','Country')
) AS source(country_code,code,name,region_type)
ON target.country_code = source.country_code
AND target.code = source.code
WHEN NOT MATCHED THEN
    INSERT(country_code,code,name,region_type)
    VALUES(source.country_code,source.code,source.name,source.region_type);
GO

DECLARE @DevTenant uniqueidentifier =
    '11111111-1111-4111-8111-111111111111';

MERGE Platform.TenantAdministrativeRegions AS target
USING (VALUES
    (@DevTenant,'CA','ON',10),
    (@DevTenant,'US','FL',20),
    (@DevTenant,'GB','ENG',30)
) AS source(tenant_id,country_code,region_code,display_order)
ON target.tenant_id = source.tenant_id
AND target.country_code = source.country_code
AND target.region_code = source.region_code
WHEN NOT MATCHED THEN
    INSERT(tenant_id,country_code,region_code,enabled,display_order)
    VALUES(source.tenant_id,source.country_code,source.region_code,1,source.display_order);

MERGE Platform.ServiceAreas AS target
USING (VALUES
    (@DevTenant,'CA','ON','OTTAWA','Ottawa',10),
    (@DevTenant,'US','FL','FLORIDA-LEGACY','Florida',20),
    (@DevTenant,'GB','ENG','LONDON','London',30)
) AS source(tenant_id,country_code,region_code,code,name,display_order)
ON target.tenant_id = source.tenant_id
AND target.code = source.code
WHEN NOT MATCHED THEN
    INSERT(id,tenant_id,country_code,region_code,code,name,enabled,display_order)
    VALUES(NEWID(),source.tenant_id,source.country_code,source.region_code,source.code,source.name,1,source.display_order);
GO


/* Persist the configured geographic hierarchy on workforce resources. */
IF COL_LENGTH('Energy.TradeResources', 'administrative_region_code') IS NULL
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD administrative_region_code varchar(40) NULL;
END;
GO

IF COL_LENGTH('Energy.TradeResources', 'service_area_id') IS NULL
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD service_area_id uniqueidentifier NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_TradeResources_AdministrativeRegion'
)
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD CONSTRAINT FK_TradeResources_AdministrativeRegion
        FOREIGN KEY(country_code, administrative_region_code)
        REFERENCES Platform.AdministrativeRegions(country_code, code);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_TradeResources_ServiceArea'
)
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD CONSTRAINT FK_TradeResources_ServiceArea
        FOREIGN KEY(service_area_id)
        REFERENCES Platform.ServiceAreas(id);
END;
GO

/* Map only the known development records; do not infer unknown geography. */
UPDATE tr
SET administrative_region_code = sa.region_code,
    service_area_id = sa.id
FROM Energy.TradeResources tr
INNER JOIN Platform.ServiceAreas sa
    ON sa.tenant_id = tr.tenant_id
   AND sa.country_code = tr.country_code
   AND sa.name = tr.service_region
WHERE tr.administrative_region_code IS NULL
  AND tr.service_area_id IS NULL;
GO
