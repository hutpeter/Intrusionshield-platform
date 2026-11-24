-- PostgreSQL identity foundation. Run using a privileged migration principal.
-- Quoted mixed-case names match the existing identity repository contract.
CREATE SCHEMA IF NOT EXISTS "Identity";
CREATE TABLE IF NOT EXISTS "Identity"."Identities" (
    "TenantId" uuid NOT NULL,
    "Id" uuid NOT NULL,
    "IdentityType" varchar(20) NOT NULL CHECK ("IdentityType" IN ('USER','SERVICE','APPLICATION','API')),
    "Status" varchar(20) NOT NULL CHECK ("Status" IN ('ACTIVE','SUSPENDED','DISABLED','PENDING')),
    "DisplayName" varchar(200) NOT NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PK_IdentityIdentities" PRIMARY KEY ("TenantId","Id")
);
CREATE TABLE IF NOT EXISTS "Identity"."Users" (
    "TenantId" uuid NOT NULL,
    "IdentityId" uuid NOT NULL,
    "Username" varchar(200) NOT NULL,
    "NormalizedUsername" varchar(200) NOT NULL,
    "Email" varchar(320) NOT NULL,
    "NormalizedEmail" varchar(320) NOT NULL,
    "EmailVerified" boolean NOT NULL DEFAULT false,
    "CreatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PK_IdentityUsers" PRIMARY KEY ("TenantId","IdentityId"),
    CONSTRAINT "FK_IdentityUsers_Identity" FOREIGN KEY ("TenantId","IdentityId")
        REFERENCES "Identity"."Identities" ("TenantId","Id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UX_IdentityUsers_Tenant_NormalizedUsername"
    ON "Identity"."Users" ("TenantId","NormalizedUsername");
CREATE INDEX IF NOT EXISTS "IX_IdentityUsers_Tenant_NormalizedEmail"
    ON "Identity"."Users" ("TenantId","NormalizedEmail");
CREATE TABLE IF NOT EXISTS "Identity"."ServiceIdentities" (
    "TenantId" uuid NOT NULL,
    "IdentityId" uuid NOT NULL,
    "ServiceName" varchar(200) NOT NULL,
    "CreatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PK_IdentityServiceIdentities" PRIMARY KEY ("TenantId","IdentityId"),
    CONSTRAINT "FK_IdentityServiceIdentities_Identity" FOREIGN KEY ("TenantId","IdentityId")
        REFERENCES "Identity"."Identities" ("TenantId","Id"),
    CONSTRAINT "UQ_IdentityServiceIdentities_Tenant_ServiceName" UNIQUE ("TenantId","ServiceName")
);
-- FORCE RLS also applies to table owners; the application principal must not have BYPASSRLS.
-- Missing tenant context must deny access. Set ruby.tenant_id only within tenant transactions.
ALTER TABLE "Identity"."Identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Identity"."Identities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ruby_identity_tenant" ON "Identity"."Identities";
CREATE POLICY "ruby_identity_tenant" ON "Identity"."Identities"
    USING ("TenantId" = NULLIF(current_setting('ruby.tenant_id', true),'')::uuid)
    WITH CHECK ("TenantId" = NULLIF(current_setting('ruby.tenant_id', true),'')::uuid);
ALTER TABLE "Identity"."Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Identity"."Users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ruby_users_tenant" ON "Identity"."Users";
CREATE POLICY "ruby_users_tenant" ON "Identity"."Users"
    USING ("TenantId" = NULLIF(current_setting('ruby.tenant_id', true),'')::uuid)
    WITH CHECK ("TenantId" = NULLIF(current_setting('ruby.tenant_id', true),'')::uuid);
ALTER TABLE "Identity"."ServiceIdentities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Identity"."ServiceIdentities" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ruby_service_tenant" ON "Identity"."ServiceIdentities";
CREATE POLICY "ruby_service_tenant" ON "Identity"."ServiceIdentities"
    USING ("TenantId" = NULLIF(current_setting('ruby.tenant_id', true),'')::uuid)
    WITH CHECK ("TenantId" = NULLIF(current_setting('ruby.tenant_id', true),'')::uuid);
