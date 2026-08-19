CREATE TABLE core.Entitlements (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    capability_id NVARCHAR(200) NOT NULL,
    license_id UNIQUEIDENTIFIER NOT NULL,
    status NVARCHAR(20) NOT NULL,
    effective_from DATETIME2(7) NOT NULL,
    effective_until DATETIME2(7) NULL,
    limits_json NVARCHAR(MAX) NULL,
    metadata_json NVARCHAR(MAX) NULL,
    revoked_at DATETIME2(7) NULL,
    revoked_reason NVARCHAR(1000) NULL,
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Entitlements_CreatedAt DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_Entitlements_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Entitlements_Status CHECK (status IN ('ACTIVE','SUSPENDED','EXPIRED','REVOKED')),
    CONSTRAINT CK_Entitlements_EffectiveWindow CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT CK_Entitlements_LimitsJson CHECK (limits_json IS NULL OR ISJSON(limits_json) = 1),
    CONSTRAINT CK_Entitlements_MetadataJson CHECK (metadata_json IS NULL OR ISJSON(metadata_json) = 1)
);

CREATE INDEX IX_Entitlements_TenantCapabilityWindow
    ON core.Entitlements (tenant_id, capability_id, status, effective_from, effective_until);

CREATE INDEX IX_Entitlements_License
    ON core.Entitlements (license_id);

CREATE UNIQUE INDEX UX_Entitlements_TenantLicenseCapability
    ON core.Entitlements (tenant_id, license_id, capability_id);
