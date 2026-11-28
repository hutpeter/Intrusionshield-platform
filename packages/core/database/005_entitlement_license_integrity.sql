-- Requires 002_licenses.sql and 003_entitlements.sql.
-- Existing orphaned or cross-tenant grants must be reconciled explicitly.
-- Do not disable constraint validation or synthesize licenses.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE core.Entitlements WITH CHECK
    ADD CONSTRAINT FK_Entitlements_TenantLicense
    FOREIGN KEY (tenant_id, license_id)
    REFERENCES core.Licenses (tenant_id, id);
COMMIT TRANSACTION;
