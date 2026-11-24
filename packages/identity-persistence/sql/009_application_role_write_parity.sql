-- Align runtime write privileges with PostgreSQL.
-- Role definitions are provisioning-owned; authorization audit is append-only.
REVOKE INSERT, UPDATE, DELETE ON [Identity].[Roles] FROM [ruby_identity_application];
REVOKE UPDATE, DELETE ON [Identity].[AuthorizationAudit] FROM [ruby_identity_application];
GO
