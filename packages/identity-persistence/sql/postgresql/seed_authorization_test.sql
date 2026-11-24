-- Disposable CI-only authorization fixtures. Run as migration principal.
INSERT INTO "Identity"."Permissions" ("Id","Name","Resource","Action","Scope") VALUES
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Read identity','identity','READ','TENANT'),
('ffffffff-ffff-4fff-8fff-ffffffffffff','Platform support','identity','SUPPORT','PLATFORM');
INSERT INTO "Identity"."Roles" ("Id","TenantId","Name","Scope") VALUES
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','Tenant reader','TENANT'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd',NULL,'Platform support','PLATFORM');
INSERT INTO "Identity"."RolePermissions" ("RoleId","PermissionId","Scope") VALUES
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','TENANT'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','ffffffff-ffff-4fff-8fff-ffffffffffff','PLATFORM');

-- Platform role assignment is created exclusively by privileged CI provisioning.
INSERT INTO "Identity"."Identities" ("TenantId","Id","IdentityType","Status","DisplayName")
VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','USER','ACTIVE','Portability fixture');
INSERT INTO "Identity"."PlatformRoleAssignments" ("TenantId","IdentityId","RoleId")
VALUES ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
