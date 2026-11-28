-- Apply after the core schema exists and before 003_entitlements.sql.
-- Review against existing installations before applying; no seed licenses.
CREATE TABLE core.Licenses (
    id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    tenant_id UNIQUEIDENTIFIER NOT NULL,
    license_number NVARCHAR(200) NOT NULL,
    type NVARCHAR(20) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    effective_from DATETIME2(7) NOT NULL,
    effective_until DATETIME2(7) NULL,
    metadata_json NVARCHAR(MAX) NULL,
    created_at DATETIME2(7) NOT NULL CONSTRAINT DF_Licenses_CreatedAt DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_Licenses_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Licenses_TenantId UNIQUE (tenant_id, id),
    CONSTRAINT UQ_Licenses_TenantNumber UNIQUE (tenant_id, license_number),
    CONSTRAINT CK_Licenses_Type CHECK (type IN ('SUBSCRIPTION','TERM','TRIAL','PERPETUAL')),
    CONSTRAINT CK_Licenses_Status CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','EXPIRED','REVOKED')),
    CONSTRAINT CK_Licenses_EffectiveWindow CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT CK_Licenses_MetadataJson CHECK (metadata_json IS NULL OR ISJSON(metadata_json) = 1)
);

CREATE INDEX IX_Licenses_TenantWindow
    ON core.Licenses (tenant_id, status, effective_from, effective_until);
