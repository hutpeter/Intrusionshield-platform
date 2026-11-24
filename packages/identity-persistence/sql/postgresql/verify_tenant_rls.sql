-- Run as non-superuser with explicit grants; fail if isolation is not enforced.
BEGIN;
SELECT set_config('ruby.tenant_id','11111111-1111-4111-8111-111111111111',true);
INSERT INTO "Identity"."Identities" ("TenantId","Id","IdentityType","Status","DisplayName")
VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','USER','ACTIVE','Tenant A');
DO $$
BEGIN
    IF (SELECT count(*) FROM "Identity"."Identities") <> 1 THEN
        RAISE EXCEPTION 'Tenant A must see its own identity';
    END IF;
END $$;
SELECT set_config('ruby.tenant_id','22222222-2222-4222-8222-222222222222',true);
DO $$
BEGIN
    IF (SELECT count(*) FROM "Identity"."Identities") <> 0 THEN
        RAISE EXCEPTION 'Tenant B can see Tenant A identity';
    END IF;
END $$;
INSERT INTO "Identity"."Identities" ("TenantId","Id","IdentityType","Status","DisplayName")
VALUES ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','USER','ACTIVE','Tenant B');
SELECT set_config('ruby.tenant_id','11111111-1111-4111-8111-111111111111',true);
DO $$
BEGIN
    IF (SELECT count(*) FROM "Identity"."Identities") <> 1 THEN
        RAISE EXCEPTION 'Tenant A can see another tenant identity';
    END IF;
END $$;
SELECT set_config('ruby.tenant_id','',true);
DO $$
BEGIN
    IF (SELECT count(*) FROM "Identity"."Identities") <> 0 THEN
        RAISE EXCEPTION 'Missing tenant context must deny all identity rows';
    END IF;
END $$;
ROLLBACK;
