import assert from "node:assert/strict";
import { SqlServerDialect, PostgreSqlDialect } from "../../database/dist/index.js";
import { SqlIdentityRepository, SqlAuthorizationRepository } from "../dist/index.js";

for (const [engine, dialect, expected] of [
    ["sqlserver", new SqlServerDialect(), {table:"[Identity].[Identities]", id:"@id", tenant:"@tenantId", now:"SYSUTCDATETIME()"}],
    ["postgresql", new PostgreSqlDialect(), {table:'"Identity"."Identities"', id:"$1", tenant:"$2", now:"CURRENT_TIMESTAMP"}]
]) {
    const calls = [];
    const provider = {
        query: async (sql, parameters) => {
            calls.push({kind:"query",sql,parameters});
            return {rows:[],rowCount:0};
        },
        execute: async (sql, parameters) => {
            calls.push({kind:"execute",sql,parameters});
            return 1;
        }
    };
    const identity = new SqlIdentityRepository(provider,dialect);
    const authorization = new SqlAuthorizationRepository(provider,dialect);
    assert.equal(await identity.findById("id","tenant"),null);
    assert.ok(calls.at(-1).sql.includes(expected.table));
    assert.ok(calls.at(-1).sql.includes(expected.id));
    assert.ok(calls.at(-1).sql.includes(expected.tenant));
    await identity.updateStatus("id","tenant","SUSPENDED");
    assert.ok(calls.at(-1).sql.includes(expected.now));
    assert.deepEqual(calls.at(-1).parameters.map(p=>p.value),["id","tenant","SUSPENDED"]);
    assert.deepEqual(await authorization.getPermissions("id","tenant"),[]);
    assert.ok(calls.at(-1).sql.includes(engine==="postgresql"?"$1":"@identityId"));
    assert.ok(calls.at(-1).sql.includes(engine==="postgresql"?"$2":"@tenantId"));
    assert.ok(calls.at(-1).sql.includes("UNION"));
}
console.log("Identity SQL dialect contract checks passed");
