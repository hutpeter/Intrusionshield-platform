import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../dist/app.js";
import { TenantConflictError } from "../dist/application/SqlPlatformTenantRepository.js";

const path = "/api/v1/admin/tenants";
const valid = { code: "demo", displayName: "Demo Client", countryCode: "CA" };

async function withServer(overrides, run) {
    const calls = { authorize: [], list: 0, create: 0 };
    const services = {
        accessTokenService: {
            verify: token => {
                if (token !== "valid") throw new Error("Invalid token");
                return { sub: "11111111-1111-4111-8111-111111111111", tenantId: "22222222-2222-4222-8222-222222222222" };
            }
        },
        authorize: async (...args) => { calls.authorize.push(args); return true; },
        list: async () => { calls.list++; return []; },
        create: async () => { calls.create++; return { id: "33333333-3333-4333-8333-333333333333", ...valid, status: "ACTIVE" }; },
        ...overrides
    };
    const server = createApp(undefined, services).listen(0, "127.0.0.1");
    try {
        await new Promise(resolve => server.once("listening", resolve));
        const address = server.address();
        const request = (method = "GET", token, body, suffix = "") =>
            fetch(`http://127.0.0.1:${address.port}${path}${suffix}`, {
                method,
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(body ? { "Content-Type": "application/json" } : {})
                },
                ...(body ? { body: JSON.stringify(body) } : {})
            });
        await run(request, calls);
    } finally {
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
}

test("no bearer token returns 401 without reading or creating tenants", async () => {
    await withServer({}, async (request, calls) => {
        assert.equal((await request()).status, 401);
        assert.equal((await request("POST", undefined, valid)).status, 401);
        assert.equal(calls.list, 0);
        assert.equal(calls.create, 0);
        assert.equal(calls.authorize.length, 0);
    });
});

test("invalid bearer token returns 401 without authorization query", async () => {
    await withServer({}, async (request, calls) => {
        assert.equal((await request("GET", "expired")).status, 401);
        assert.equal(calls.authorize.length, 0);
    });
});

test("denied permission returns 403 and never accesses tenant repository", async () => {
    await withServer({ authorize: async () => false }, async (request, calls) => {
        assert.equal((await request("GET", "valid")).status, 403);
        assert.equal((await request("POST", "valid", valid)).status, 403);
        assert.equal(calls.list, 0);
        assert.equal(calls.create, 0);
    });
});

test("authorization or audit failure returns 503 without accessing tenants", async () => {
    await withServer({ authorize: async () => { throw Error("audit unavailable"); } }, async (request, calls) => {
        assert.equal((await request("GET", "valid")).status, 503);
        assert.equal((await request("POST", "valid", valid)).status, 503);
        assert.equal(calls.list, 0);
        assert.equal(calls.create, 0);
    });
});

test("authorized listing validates pagination and returns tenants", async () => {
    await withServer({}, async (request, calls) => {
        assert.equal((await request("GET", "valid", undefined, "?limit=0")).status, 400);
        assert.equal((await request("GET", "valid", undefined, "?offset=-1")).status, 400);
        const response = await request("GET", "valid", undefined, "?limit=20&offset=0");
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { tenants: [] });
        assert.equal(calls.list, 1);
        assert.equal(calls.authorize.at(-1)[2], "READ");
    });
});

test("authorized create validates input before calling provisioning", async () => {
    await withServer({}, async (request, calls) => {
        assert.equal((await request("POST", "valid", { code: "?", displayName: "X", countryCode: "?" })).status, 400);
        assert.equal(calls.create, 0);
        const response = await request("POST", "valid", valid);
        assert.equal(response.status, 201);
        assert.equal((await response.json()).tenant.code, "demo");
        assert.equal(calls.create, 1);
        assert.equal(calls.authorize.at(-1)[2], "CREATE");
    });
});

test("duplicate tenant code returns 409 without leaking SQL errors", async () => {
    await withServer({ create: async () => { throw new TenantConflictError("duplicate"); } }, async request => {
        const response = await request("POST", "valid", valid);
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: "TENANT_CODE_EXISTS" });
    });
});

test("disabled or failed provisioning returns 503", async () => {
    await withServer({ create: async () => { throw Error("Tenant creation is not enabled."); } }, async request => {
        const response = await request("POST", "valid", valid);
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: "TENANT_PROVISIONING_UNAVAILABLE" });
    });
});
