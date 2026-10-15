/*
    Ruby shared Country / Regional Configuration foundation.

    Tenant-configurable items introduced here belong to the Ruby Tenant
    Configuration Catalog and will later be administered through the
    onboarding / Tenant Configuration GUI.
*/

IF NOT EXISTS (
    SELECT 1
    FROM sys.schemas
    WHERE name = 'Platform'
)
BEGIN
    EXEC('CREATE SCHEMA Platform');
END;
GO

IF OBJECT_ID('Platform.Currencies', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.Currencies (
        code char(3) NOT NULL,
        name nvarchar(120) NOT NULL,
        symbol nvarchar(12) NULL,
        decimal_places tinyint NOT NULL
            CONSTRAINT DF_PlatformCurrencies_Decimals DEFAULT 2,
        status varchar(20) NOT NULL
            CONSTRAINT DF_PlatformCurrencies_Status DEFAULT 'ACTIVE',
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_PlatformCurrencies_Created DEFAULT SYSUTCDATETIME(),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_PlatformCurrencies_Updated DEFAULT SYSUTCDATETIME(),
        version int NOT NULL
            CONSTRAINT DF_PlatformCurrencies_Version DEFAULT 1,
        CONSTRAINT PK_PlatformCurrencies PRIMARY KEY (code),
        CONSTRAINT CK_PlatformCurrencies_Decimals CHECK (decimal_places BETWEEN 0 AND 4),
        CONSTRAINT CK_PlatformCurrencies_Status CHECK (status IN ('ACTIVE','INACTIVE'))
    );
END;
GO

IF OBJECT_ID('Platform.Countries', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.Countries (
        code char(2) NOT NULL,
        alpha3_code char(3) NOT NULL,
        name nvarchar(120) NOT NULL,
        default_currency_code char(3) NOT NULL,
        default_locale varchar(20) NULL,
        status varchar(20) NOT NULL
            CONSTRAINT DF_PlatformCountries_Status DEFAULT 'ACTIVE',
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_PlatformCountries_Created DEFAULT SYSUTCDATETIME(),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_PlatformCountries_Updated DEFAULT SYSUTCDATETIME(),
        version int NOT NULL
            CONSTRAINT DF_PlatformCountries_Version DEFAULT 1,
        CONSTRAINT PK_PlatformCountries PRIMARY KEY (code),
        CONSTRAINT UQ_PlatformCountries_Alpha3 UNIQUE (alpha3_code),
        CONSTRAINT FK_PlatformCountries_Currency
            FOREIGN KEY (default_currency_code)
            REFERENCES Platform.Currencies(code),
        CONSTRAINT CK_PlatformCountries_Status CHECK (status IN ('ACTIVE','INACTIVE'))
    );
END;
GO

IF OBJECT_ID('Platform.TenantRegionalSettings', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.TenantRegionalSettings (
        tenant_id uniqueidentifier NOT NULL,
        default_country_code char(2) NOT NULL,
        default_currency_code char(3) NOT NULL,
        default_locale varchar(20) NULL,
        default_time_zone varchar(100) NULL,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_TenantRegionalSettings_Created DEFAULT SYSUTCDATETIME(),
        updated_at datetime2(3) NOT NULL
            CONSTRAINT DF_TenantRegionalSettings_Updated DEFAULT SYSUTCDATETIME(),
        version int NOT NULL
            CONSTRAINT DF_TenantRegionalSettings_Version DEFAULT 1,
        CONSTRAINT PK_TenantRegionalSettings PRIMARY KEY (tenant_id),
        CONSTRAINT FK_TenantRegionalSettings_Country
            FOREIGN KEY (default_country_code)
            REFERENCES Platform.Countries(code),
        CONSTRAINT FK_TenantRegionalSettings_Currency
            FOREIGN KEY (default_currency_code)
            REFERENCES Platform.Currencies(code)
    );
END;
GO

IF OBJECT_ID('Platform.TenantCountries', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.TenantCountries (
        tenant_id uniqueidentifier NOT NULL,
        country_code char(2) NOT NULL,
        enabled bit NOT NULL
            CONSTRAINT DF_TenantCountries_Enabled DEFAULT 1,
        display_order int NOT NULL
            CONSTRAINT DF_TenantCountries_Order DEFAULT 100,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_TenantCountries_Created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_TenantCountries PRIMARY KEY (tenant_id, country_code),
        CONSTRAINT FK_TenantCountries_Country
            FOREIGN KEY (country_code)
            REFERENCES Platform.Countries(code)
    );
END;
GO

IF OBJECT_ID('Platform.TenantCurrencies', 'U') IS NULL
BEGIN
    CREATE TABLE Platform.TenantCurrencies (
        tenant_id uniqueidentifier NOT NULL,
        currency_code char(3) NOT NULL,
        enabled bit NOT NULL
            CONSTRAINT DF_TenantCurrencies_Enabled DEFAULT 1,
        display_order int NOT NULL
            CONSTRAINT DF_TenantCurrencies_Order DEFAULT 100,
        created_at datetime2(3) NOT NULL
            CONSTRAINT DF_TenantCurrencies_Created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_TenantCurrencies PRIMARY KEY (tenant_id, currency_code),
        CONSTRAINT FK_TenantCurrencies_Currency
            FOREIGN KEY (currency_code)
            REFERENCES Platform.Currencies(code)
    );
END;
GO

MERGE Platform.Currencies AS target
USING (VALUES
    ('CAD','Canadian Dollar','$',2),
    ('USD','US Dollar','$',2),
    ('GBP','Pound Sterling','£',2),
    ('EUR','Euro','€',2),
    ('PEN','Peruvian Sol','S/',2),
    ('JPY','Japanese Yen','¥',0),
    ('THB','Thai Baht','฿',2),
    ('MYR','Malaysian Ringgit','RM',2),
    ('VND','Vietnamese Dong','₫',0),
    ('AUD','Australian Dollar','$',2),
    ('NZD','New Zealand Dollar','$',2),
    ('SGD','Singapore Dollar','$',2),
    ('INR','Indian Rupee','₹',2),
    ('BRL','Brazilian Real','R$',2),
    ('MXN','Mexican Peso','$',2),
    ('CHF','Swiss Franc','CHF',2),
    ('CNY','Chinese Yuan','¥',2),
    ('KRW','South Korean Won','₩',0)
) AS source(code,name,symbol,decimal_places)
ON target.code = source.code
WHEN NOT MATCHED THEN
    INSERT(code,name,symbol,decimal_places)
    VALUES(source.code,source.name,source.symbol,source.decimal_places);
GO

MERGE Platform.Countries AS target
USING (VALUES
    ('CA','CAN','Canada','CAD','en-CA'),
    ('US','USA','United States','USD','en-US'),
    ('GB','GBR','United Kingdom','GBP','en-GB'),
    ('PE','PER','Peru','PEN','es-PE'),
    ('JP','JPN','Japan','JPY','ja-JP'),
    ('TH','THA','Thailand','THB','th-TH'),
    ('MY','MYS','Malaysia','MYR','ms-MY'),
    ('VN','VNM','Vietnam','VND','vi-VN'),
    ('AU','AUS','Australia','AUD','en-AU'),
    ('NZ','NZL','New Zealand','NZD','en-NZ'),
    ('SG','SGP','Singapore','SGD','en-SG'),
    ('IN','IND','India','INR','en-IN'),
    ('BR','BRA','Brazil','BRL','pt-BR'),
    ('MX','MEX','Mexico','MXN','es-MX'),
    ('CH','CHE','Switzerland','CHF','de-CH'),
    ('FR','FRA','France','EUR','fr-FR'),
    ('DE','DEU','Germany','EUR','de-DE'),
    ('ES','ESP','Spain','EUR','es-ES'),
    ('IT','ITA','Italy','EUR','it-IT'),
    ('CN','CHN','China','CNY','zh-CN'),
    ('KR','KOR','South Korea','KRW','ko-KR')
) AS source(code,alpha3_code,name,default_currency_code,default_locale)
ON target.code = source.code
WHEN NOT MATCHED THEN
    INSERT(code,alpha3_code,name,default_currency_code,default_locale)
    VALUES(source.code,source.alpha3_code,source.name,source.default_currency_code,source.default_locale);
GO

IF COL_LENGTH('Energy.TradeResources', 'country_code') IS NULL
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD country_code char(2) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = 'FK_TradeResources_Country'
)
BEGIN
    ALTER TABLE Energy.TradeResources
        ADD CONSTRAINT FK_TradeResources_Country
        FOREIGN KEY(country_code)
        REFERENCES Platform.Countries(code);
END;
GO

/*
    Backward-compatible migration of existing records:
    CAD records are assigned CA. Other existing records remain NULL because
    Ruby must not guess a country from free-form Service Region text.
*/
UPDATE Energy.TradeResources
SET country_code = 'CA'
WHERE country_code IS NULL
  AND currency = 'CAD';
GO

/*
    DEV TENANT SEED
    This is onboarding configuration data, not a permanent product default.
    Future tenants will receive these rows from the Tenant Onboarding GUI/API.
*/
DECLARE @DevTenant uniqueidentifier =
    '11111111-1111-4111-8111-111111111111';

IF NOT EXISTS (
    SELECT 1 FROM Platform.TenantRegionalSettings
    WHERE tenant_id = @DevTenant
)
BEGIN
    INSERT Platform.TenantRegionalSettings
        (tenant_id, default_country_code, default_currency_code, default_locale, default_time_zone)
    VALUES
        (@DevTenant, 'CA', 'CAD', 'en-CA', 'America/Toronto');
END;

MERGE Platform.TenantCountries AS target
USING (
    SELECT @DevTenant tenant_id, code country_code,
           CASE code WHEN 'CA' THEN 10 WHEN 'US' THEN 20 WHEN 'GB' THEN 30
                     WHEN 'PE' THEN 40 WHEN 'JP' THEN 50 WHEN 'TH' THEN 60
                     WHEN 'MY' THEN 70 WHEN 'VN' THEN 80 ELSE 100 END display_order
    FROM Platform.Countries
    WHERE status = 'ACTIVE'
) AS source
ON target.tenant_id = source.tenant_id
AND target.country_code = source.country_code
WHEN NOT MATCHED THEN
    INSERT(tenant_id,country_code,enabled,display_order)
    VALUES(source.tenant_id,source.country_code,1,source.display_order);

MERGE Platform.TenantCurrencies AS target
USING (
    SELECT @DevTenant tenant_id, code currency_code,
           CASE code WHEN 'CAD' THEN 10 WHEN 'USD' THEN 20 WHEN 'GBP' THEN 30
                     WHEN 'PEN' THEN 40 WHEN 'EUR' THEN 50 ELSE 100 END display_order
    FROM Platform.Currencies
    WHERE status = 'ACTIVE'
) AS source
ON target.tenant_id = source.tenant_id
AND target.currency_code = source.currency_code
WHEN NOT MATCHED THEN
    INSERT(tenant_id,currency_code,enabled,display_order)
    VALUES(source.tenant_id,source.currency_code,1,source.display_order);
GO
