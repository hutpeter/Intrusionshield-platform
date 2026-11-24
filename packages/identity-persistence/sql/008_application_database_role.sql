/*
 * Provision a least-privilege application database role.
 * Deployment administrators explicitly add application users to this role;
 * migrations never create logins or embed credentials.
 *
 * RLS still applies to every member. Platform assignments and authorization
 * catalogs are read-only. No schema, policy, or migration-history privileges.
 */
IF DATABASE_PRINCIPAL_ID(N'ruby_identity_application') IS NULL
    CREATE ROLE [ruby_identity_application];
GO
GRANT SELECT ON SCHEMA::[Identity] TO [ruby_identity_application];
GO
GRANT INSERT, UPDATE, DELETE ON [Identity].[Identities] TO [ruby_identity_application];
GRANT INSERT, UPDATE, DELETE ON [Identity].[Users] TO [ruby_identity_application];
GRANT INSERT, UPDATE, DELETE ON [Identity].[ServiceIdentities] TO [ruby_identity_application];
GRANT INSERT, UPDATE, DELETE ON [Identity].[IdentityRoles] TO [ruby_identity_application];
GRANT INSERT, UPDATE, DELETE ON [Identity].[Roles] TO [ruby_identity_application];
GRANT INSERT, UPDATE, DELETE ON [Identity].[AuthorizationAudit] TO [ruby_identity_application];
GO
