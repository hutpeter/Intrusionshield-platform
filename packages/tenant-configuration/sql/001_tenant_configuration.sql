/*
    EIS Tenant Configuration Foundation

    Tenant configuration is a platform capability and is deliberately
    separate from Athena/HIS schemas.

    Language, country, locale and timezone are distinct settings.
*/

IF NOT EXISTS (
    SELECT 1
    FROM sys.schemas
    WHERE name = N'EIS'
)
BEGIN
    EXEC(N'CREATE SCHEMA EIS');
END;
GO

IF OBJECT_ID(
    N'EIS.TenantConfigurations',
    N'U'
) IS NULL
BEGIN
    CREATE TABLE EIS.TenantConfigurations
    (
        tenant_id UNIQUEIDENTIFIER NOT NULL,
        country_code NVARCHAR(2) NULL,
        default_language NVARCHAR(20) NULL,
        locale NVARCHAR(35) NULL,
        time_zone NVARCHAR(100) NULL,
        created_at DATETIME2(7) NOT NULL,
        updated_at DATETIME2(7) NOT NULL,
        version INT NOT NULL,

        CONSTRAINT PK_EIS_TenantConfigurations
            PRIMARY KEY (tenant_id),

        CONSTRAINT CK_EIS_TenantConfigurations_Country
            CHECK (
                country_code IS NULL OR
                (
                    LEN(country_code) = 2 AND
                    country_code = UPPER(country_code)
                )
            ),

        CONSTRAINT CK_EIS_TenantConfigurations_Language
            CHECK (
                default_language IS NULL OR
                default_language IN (N'en', N'es')
            ),

        CONSTRAINT CK_EIS_TenantConfigurations_Version
            CHECK (version >= 1)
    );
END;
GO
