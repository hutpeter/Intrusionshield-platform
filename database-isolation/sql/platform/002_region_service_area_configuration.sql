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

