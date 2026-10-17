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
