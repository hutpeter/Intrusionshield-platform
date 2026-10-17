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


