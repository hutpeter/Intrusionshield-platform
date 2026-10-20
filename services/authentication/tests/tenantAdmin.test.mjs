import test from "node:test";
import assert from "node:assert/strict";
import { PlatformTenantAuthorization } from "../dist/application/PlatformTenantAuthorization.js";
import { TenantAuthorizationAudit } from "../dist/application/TenantAuthorizationAudit.js";
import { TenantProvisioningService } from "../dist/application/TenantProvisioningService.js";

const identity = "11111111-1111-4111-8111-111111111111";
const tenant = "22222222-2222-4222-8222-222222222222";

test("platform authorization permits only an explicit positive result", async () => {
    for (const [value, expected] of [[1, true], [0, false], [undefined, false]]) {
        const database = { query: async () => ({ rows: value === undefined ? [] : [{ allowed: value }] }) };
        assert.equal(await new PlatformTenantAuthorization(database).allowed(identity, tenant, "READ"), expected);
    }
});

test("malformed identity fails closed without a database query", async () => {
    const database = { query: async () => { throw Error("must not query"); } };
    assert.equal(await new PlatformTenantAuthorization(database).allowed("invalid", tenant, "CREATE"), false);
});

test("authorization database errors fail closed by rejecting", async () => {
    const database = { query: async () => { throw Error("database unavailable"); } };
    await assert.rejects(new PlatformTenantAuthorization(database).allowed(identity, tenant, "READ"));
});

test("authorization audit persists granted and denied decisions", async () => {
    const calls = [];
    const database = { execute: async (...args) => { calls.push(args); return 1; } };
    const audit = new TenantAuthorizationAudit(database);
    await audit.record(identity, tenant, "READ", true);
    await audit.record(identity, tenant, "CREATE", false);
    assert.equal(calls.length, 2);
    assert.match(calls[0][0], /AuthorizationAudit/);
    assert.equal(calls[0][1].find(p => p.name === "allowed").value, true);
    assert.equal(calls[1][1].find(p => p.name === "allowed").value, false);
});

test("audit write failure propagates and cannot be mistaken for success", async () => {
    const database = { execute: async () => { throw Error("audit unavailable"); } };
    await assert.rejects(new TenantAuthorizationAudit(database).record(identity, tenant, "READ", true));
});

test("provisioning commits registry and configuration together", async () => {
    const steps = [];
    const database = {
        beginTransaction: async () => steps.push("begin"),
        commitTransaction: async () => steps.push("commit"),
        rollbackTransaction: async () => steps.push("rollback")
    };
    const tenants = { create: async () => { steps.push("tenant"); return { id: tenant, countryCode: "CA" }; } };
    const configuration = { create: async () => { steps.push("config"); } };
    await new TenantProvisioningService(database, tenants, configuration).create({
        code: "demo", displayName: "Demo Tenant", countryCode: "CA"
    });
    assert.deepEqual(steps, ["begin", "tenant", "config", "commit"]);
});

test("provisioning rolls back if initial configuration fails", async () => {
    const steps = [];
    const database = {
        beginTransaction: async () => steps.push("begin"),
        commitTransaction: async () => steps.push("commit"),
        rollbackTransaction: async () => steps.push("rollback")
    };
    const tenants = { create: async () => { steps.push("tenant"); return { id: tenant, countryCode: "CA" }; } };
    const configuration = { create: async () => { steps.push("config"); throw Error("configuration failure"); } };
    await assert.rejects(new TenantProvisioningService(database, tenants, configuration).create({
        code: "demo", displayName: "Demo Tenant", countryCode: "CA"
    }));
    assert.deepEqual(steps, ["begin", "tenant", "config", "rollback"]);
});
