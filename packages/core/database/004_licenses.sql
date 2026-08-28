CREATE TABLE core.Licenses (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    license_key NVARCHAR(200) NOT NULL,
    license_type NVARCHAR(50) NOT NULL,
    tier NVARCHAR(100) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    effective_from DATETIME2(7) NOT NULL,
    effective_until DATETIME2(7) NULL,
    metadata_json NVARCHAR(MAX) NULL,
    suspended_at DATETIME2(7) NULL,
    suspension_reason NVARCHAR(1000) NULL,
    revoked_at DATETIME2(7) NULL,
    revocation_reason NVARCHAR(1000) NULL,
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Licenses_CreatedAt DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_Licenses_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Licenses_LicenseKey UNIQUE (license_key),
    CONSTRAINT CK_Licenses_Status CHECK (status IN ('ACTIVE','SUSPENDED','EXPIRED','REVOKED')),
    CONSTRAINT CK_Licenses_Type CHECK (license_type IN ('SUBSCRIPTION','PERPETUAL','TRIAL','INTERNAL')),
    CONSTRAINT CK_Licenses_EffectiveWindow CHECK (effective_until IS NULL OR effective_until >= effective_from),
    CONSTRAINT CK_Licenses_MetadataJson CHECK (metadata_json IS NULL OR ISJSON(metadata_json) = 1)
);

CREATE INDEX IX_Licenses_TenantStatus
    ON core.Licenses (tenant_id, status, effective_from, effective_until);

CREATE INDEX IX_Licenses_Tenant
    ON core.Licenses (tenant_id);
