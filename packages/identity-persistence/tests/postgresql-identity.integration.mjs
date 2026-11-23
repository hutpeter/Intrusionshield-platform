import assert from "node:assert/strict";
import { PostgreSqlProvider, PostgreSqlDialect } from "../../database/dist/index.js";
import { SqlIdentityRepository, SqlAuthorizationRepository } from "../dist/index.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const identityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tenantRoleId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const provider = new PostgreSqlProvider({
    host: process.env.RUBY_TEST_POSTGRES_HOST ?? "localhost",
    port: Number(process.env.RUBY_TEST_POSTGRES_PORT ?? 5432),
    database: process.env.RUBY_TEST_POSTGRES_DB ?? "ruby_portability_test",
    user: process.env.RUBY_TEST_POSTGRES_USER ?? "ruby_app_test",
    password: process.env.RUBY_TEST_POSTGRES_PASSWORD ?? "ruby_app_test_password"
});
await provider.connect();
try {
    const identity = new SqlIdentityRepository(provider, new PostgreSqlDialect());
    const authorization = new SqlAuthorizationRepository(provider, new PostgreSqlDialect());
    await provider.withTenantTransaction(tenantA, async db => {
        const found = await identity.findById(identityId, tenantA);
        assert.equal(found?.displayName, "Portability fixture");
        assert.equal(found?.status, "ACTIVE");
        assert.deepEqual((await authorization.getPermissions(identityId, tenantA)).map(p => p.action), ["SUPPORT"]);
        await db.execute(
            'INSERT INTO "Identity"."IdentityRoles" ("TenantId","IdentityId","RoleId") VALUES ($1,$2,$3)',
            [{name:"tenant",value:tenantA},{name:"identity",value:identityId},{name:"role",value:tenantRoleId}]
        );
        let permissions = await authorization.getPermissions(identityId, tenantA);
        assert.deepEqual(permissions.map(p => p.action).sort(), ["READ","SUPPORT"], "Tenant and platform permissions must combine");
        await identity.updateStatus(identityId, tenantA, "SUSPENDED");
        assert.equal((await identity.findById(identityId, tenantA))?.status, "SUSPENDED");
        assert.deepEqual(await authorization.getPermissions(identityId, tenantA), []);
    });
    await provider.withTenantTransaction(tenantB, async () => {
        assert.equal(await identity.findById(identityId, tenantA), null);
        await assert.rejects(() => identity.updateStatus(identityId, tenantA, "ACTIVE"), /Identity was not found/);
        assert.deepEqual(await authorization.getPermissions(identityId, tenantA), []);
    });
    await provider.withTenantTransaction(tenantB, async db => {
        const tenantBIdentity = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        await db.execute(
            'INSERT INTO "Identity"."Identities" ("TenantId","Id","IdentityType","Status","DisplayName") VALUES ($1,$2,$3,$4,$5)',
            [
                {name:"tenant",value:tenantB},{name:"id",value:tenantBIdentity},
                {name:"type",value:"USER"},{name:"status",value:"ACTIVE"},
                {name:"name",value:"Tenant B fixture"}
            ]
        );
        assert.equal((await identity.findById(tenantBIdentity,tenantB))?.status,"ACTIVE");
        assert.deepEqual(await authorization.getPermissions(tenantBIdentity,tenantB),[]);
        assert.equal(await identity.findById(identityId,tenantA),null);
    });
    assert.equal(await identity.findById(identityId, tenantA), null, "Missing tenant context must fail closed");
    assert.deepEqual(await authorization.getPermissions(identityId, tenantA), [], "Missing tenant context must deny permissions");
    await assert.rejects(
        () => identity.updateStatus(identityId, tenantA, "ACTIVE"),
        /Identity was not found/,
        "Missing tenant context must deny status updates"
    );
    await assert.rejects(
        () => provider.withTenantTransaction(tenantA, async db => {
            await db.execute(
                'INSERT INTO "Identity"."Permissions" ("Id","Name","Resource","Action","Scope") VALUES ($1,$2,$3,$4,$5)',
                [
                    {name:"id",value:"99999999-9999-4999-8999-999999999999"},
                    {name:"name",value:"Escalation attempt"},
                    {name:"resource",value:"identity"},
                    {name:"action",value:"ADMIN"},
                    {name:"scope",value:"PLATFORM"}
                ]
            );
        }),
        /permission denied|row-level security|policy/i,
        "Application principal must not alter permission catalog"
    );
    await assert.rejects(
        () => provider.withTenantTransaction(tenantB, async db => {
            await db.execute(
                'INSERT INTO "Identity"."PlatformRoleAssignments" ("TenantId","IdentityId","RoleId") VALUES ($1,$2,$3)',
                [{name:"tenant",value:tenantB},{name:"identity",value:identityId},{name:"role",value:"dddddddd-dddd-4ddd-8ddd-dddddddddddd"}]
            );
        }),
        /permission denied|row-level security|policy/i,
        "Tenant application role must never create platform assignments"
    );
    await assert.rejects(
        () => provider.withTenantTransaction(tenantB, async db => {
            await db.execute(
                'INSERT INTO "Identity"."IdentityRoles" ("TenantId","IdentityId","RoleId") VALUES ($1,$2,$3)',
                [{name:"tenant",value:tenantA},{name:"identity",value:identityId},{name:"role",value:tenantRoleId}]
            );
        }),
        /row-level security|policy/i,
        "Tenant B must not assign roles to Tenant A"
    );
    await assert.rejects(
        () => provider.withTenantTransaction(tenantB, async db => {
            await db.execute(
                'INSERT INTO "Identity"."IdentityRoles" ("TenantId","IdentityId","RoleId") VALUES ($1,$2,$3)',
                [
                    {name:"tenant",value:tenantB},
                    {name:"identity",value:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},
                    {name:"role",value:tenantRoleId}
                ]
            );
        }),
        /foreign key|violates|permission denied|row-level security|policy/i,
        "Tenant B must not acquire Tenant A's role even with its own identity"
    );
    await provider.withTenantTransaction(tenantB, async () => {
        assert.deepEqual(
            await authorization.getPermissions("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",tenantB),
            [],
            "Denied role assignment must not grant Tenant B any permissions"
        );
    });
    await assert.rejects(
        () => provider.execute(
            'INSERT INTO "Identity"."Identities" ("TenantId","Id","IdentityType","Status","DisplayName") VALUES ($1,$2,$3,$4,$5)',
            [
                {name:"tenant",value:tenantB},
                {name:"id",value:"88888888-8888-4888-8888-888888888888"},
                {name:"type",value:"USER"},
                {name:"status",value:"ACTIVE"},
                {name:"name",value:"Unscoped attempt"}
            ]
        ),
        /row-level security|policy/i,
        "Direct application writes without a tenant transaction must fail closed"
    );
    await provider.withTenantTransaction(tenantB, async db => {
            const changed = await db.execute(
                'UPDATE "Identity"."Identities" SET "Status" = $1 WHERE "TenantId" = $2 AND "Id" = $3',
                [
                    {name:"status",value:"ACTIVE"},
                    {name:"tenant",value:tenantA},
                    {name:"id",value:identityId}
                ]
            );
            assert.equal(changed,0,"Tenant B must not update Tenant A via direct SQL");
            const leaked = await db.query(
                'SELECT "Id" FROM "Identity"."Identities" WHERE "TenantId" = $1 AND "Id" = $2',
                [{name:"tenant",value:tenantA},{name:"id",value:identityId}]
            );
            assert.equal(leaked.rows.length,0,"Tenant B must not read Tenant A identity via direct SQL");
        });
    console.log("PostgreSQL identity persistence integration passed");
} finally {
    await provider.disconnect();
}
