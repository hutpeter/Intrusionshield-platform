/*
Forward-only migration for the authorization database.
Requires Platform.Tenants and Identity.Identities.
Review and validate in a disposable database before deployment.
No permissions or customer assignments are seeded.
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE [Platform].[LicensingCustomerScopes] (
    Id uniqueidentifier NOT NULL CONSTRAINT PK_LicensingCustomerScopes PRIMARY KEY,
    IdentityId uniqueidentifier NOT NULL,
    HomeTenantId uniqueidentifier NOT NULL,
    CustomerTenantId uniqueidentifier NOT NULL,
    EffectiveFrom datetime2(7) NOT NULL,
    EffectiveUntil datetime2(7) NULL,
    RevokedAt datetime2(7) NULL,
    CreatedAt datetime2(7) NOT NULL CONSTRAINT DF_LicensingCustomerScopes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_LicensingCustomerScopes_Customer FOREIGN KEY (CustomerTenantId) REFERENCES [Platform].[Tenants](Id),
    CONSTRAINT CK_LicensingCustomerScopes_Window CHECK (EffectiveUntil IS NULL OR EffectiveUntil > EffectiveFrom),
    CONSTRAINT CK_LicensingCustomerScopes_Revocation CHECK (RevokedAt IS NULL OR RevokedAt >= CreatedAt)
);
CREATE INDEX IX_LicensingCustomerScopes_Lookup
    ON [Platform].[LicensingCustomerScopes](HomeTenantId, IdentityId, CustomerTenantId, EffectiveFrom)
    INCLUDE (EffectiveUntil, RevokedAt);
COMMIT TRANSACTION;
