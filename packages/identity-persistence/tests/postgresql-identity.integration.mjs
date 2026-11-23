import assert from "node:assert/strict";
import { PostgreSqlProvider, PostgreSqlDialect } from "../../database/dist/index.js";
import { SqlIdentityRepository, SqlAuthorizationRepository } from "../dist/index.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const identityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
        await db.execute(
            'INSERT INTO "Identity"."Identities" ("TenantId","Id","IdentityType","Status","DisplayName") VALUES ($1,$2,$3,$4,$5)',
            [
                {name:"tenant",value:tenantA}, {name:"id",value:identityId},
                {name:"type",value:"USER"}, {name:"status",value:"ACTIVE"},
                {name:"name",value:"Portability fixture"}
            ]
        );
        const found = await identity.findById(identityId, tenantA);
        assert.equal(found?.displayName, "Portability fixture");
        assert.equal(found?.status, "ACTIVE");
        assert.deepEqual(await authorization.getPermissions(identityId, tenantA), []);
        await identity.updateStatus(identityId, tenantA, "SUSPENDED");
        assert.equal((await identity.findById(identityId, tenantA))?.status, "SUSPENDED");
        assert.deepEqual(await authorization.getPermissions(identityId, tenantA), []);
    });
    await provider.withTenantTransaction(tenantB, async () => {
        assert.equal(await identity.findById(identityId, tenantA), null);
        await assert.rejects(() => identity.updateStatus(identityId, tenantA, "ACTIVE"), /Identity was not found/);
        assert.deepEqual(await authorization.getPermissions(identityId, tenantA), []);
    });
    assert.equal(await identity.findById(identityId, tenantA), null, "Missing tenant context must fail closed");
    console.log("PostgreSQL identity persistence integration passed");
} finally {
    await provider.disconnect();
}
