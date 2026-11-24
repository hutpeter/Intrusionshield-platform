-- Runtime group role; deployment administrators grant membership to login roles.
-- No credentials or login accounts are provisioned by this migration.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ruby_identity_application') THEN
        CREATE ROLE ruby_identity_application NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END
$$;
GRANT USAGE ON SCHEMA "Identity" TO ruby_identity_application;
GRANT SELECT ON ALL TABLES IN SCHEMA "Identity" TO ruby_identity_application;
GRANT INSERT, UPDATE, DELETE ON "Identity"."Identities", "Identity"."Users",
    "Identity"."ServiceIdentities", "Identity"."IdentityRoles" TO ruby_identity_application;
GRANT INSERT ON "Identity"."AuthorizationAudit" TO ruby_identity_application;
-- Roles and permission catalogs remain provisioning-owned.
-- RLS remains mandatory for all runtime members.
