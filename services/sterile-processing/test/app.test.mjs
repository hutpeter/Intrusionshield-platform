import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createSterileApp } from "../dist/app.js";
import { MemoryRepository } from "../../../packages/sterile-processing/test/memory-repository.mjs";
async function fixture(t, options = {}) {
  const principal = {
      tenantId: randomUUID(),
      actorId: randomUUID(),
      facilityIds: [randomUUID()],
    },
    repository = new MemoryRepository();
  const decisions = [];
  const defaults = {
    repository,
    authenticate: async (token) => (token === "test-token" ? principal : null),
    authorize: async (...args) => {
      decisions.push(args);
      return true;
    },
  };
  const app = createSterileApp({ ...defaults, ...options }),
    server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = "http://127.0.0.1:" + server.address().port,
    base = "/api/v1/sterile/facilities/" + principal.facilityIds[0];
  const call = (path, body, headers = {}) =>
    fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: "Bearer test-token",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { origin, base, call, principal, repository, decisions };
}
const typeBody = () => ({
  requestId: randomUUID(),
  code: "CLAMP",
  name: "Pinza",
  manufacturer: "",
  model: "",
});
test("standalone service denies unconfigured access and makes no clinical claim", async (t) => {
  const f = await fixture(t, {
    repository: undefined,
    authenticate: undefined,
    authorize: undefined,
  });
  const health = await fetch(f.origin + "/health");
  assert.equal((await health.json()).clinicalUseEnabled, false);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.equal((await f.call(f.base + "/instruments")).status, 503);
  assert.equal((await fetch(f.origin + f.base + "/instruments")).status, 401);
});
test("requires verified bearer membership and centralized authorization before mutations", async (t) => {
  const f = await fixture(t, { authorize: async () => false });
  assert.equal(
    (await f.call(f.base + "/instrument-types", typeBody())).status,
    403,
  );
  assert.equal(
    (
      await f.call(f.base + "/instruments", undefined, {
        authorization: "Bearer invalid",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.call(f.base + "/instruments", undefined, {
        cookie: "session=not-supported",
      })
    ).status,
    401,
  );
  assert.equal(f.repository.state.audit.length, 0);
});
test("creates a catalogue and instrument, lists it and retires through an audited scoped API", async (t) => {
  const f = await fixture(t);
  let response = await f.call(f.base + "/instrument-types", typeBody());
  assert.equal(response.status, 201);
  const type = await response.json();
  const body = {
    requestId: randomUUID(),
    instrumentTypeId: type.id,
    code: "INS-001",
    serialNumber: "S1",
  };
  response = await f.call(f.base + "/instruments", body);
  assert.equal(response.status, 201);
  const i = await response.json();
  assert.equal(i.tenantId, f.principal.tenantId);
  assert.equal(i.state, "registered");
  assert.deepEqual(
    await (await f.call(f.base + "/instruments", body)).json(),
    i,
  );
  assert.equal(
    (await (await f.call(f.base + "/instruments")).json()).items.length,
    1,
  );
  const retired = await f.call(f.base + "/instruments/" + i.id + "/retire", {
    requestId: randomUUID(),
    version: i.version,
    reason: "Damaged",
  });
  assert.equal(retired.status, 200);
  assert.equal((await retired.json()).state, "retired");
  assert.equal(f.repository.state.audit.length, 3);
  assert.ok(f.decisions.every((x) => x[1] === "sterile.core"));
  assert.equal(f.decisions[0][2], "instruments:write");
});
test("rejects foreign facilities, tenant injection, invalid queries and unsafe fields", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.call(
        "/api/v1/sterile/facilities/" + randomUUID() + "/instruments",
      )
    ).status,
    404,
  );
  for (const extra of [
    { tenantId: randomUUID() },
    { facilityId: randomUUID() },
    { actorId: randomUUID() },
    { state: "released" },
  ])
    assert.equal(
      (await f.call(f.base + "/instrument-types", { ...typeBody(), ...extra }))
        .status,
      400,
    );
  for (const query of [
    "?tenantId=" + randomUUID(),
    "?page=0",
    "?page=1&page=2",
    "?page=1.1",
  ])
    assert.equal((await f.call(f.base + "/instruments" + query)).status, 400);
  assert.equal(
    (await f.call(f.base + "/instrument-types?other=true", typeBody())).status,
    400,
  );
  assert.equal(f.repository.state.audit.length, 0);
});
test("returns safe errors for malformed/oversized input and storage errors, and exposes no release route", async (t) => {
  const f = await fixture(t);
  let r = await fetch(f.origin + f.base + "/instrument-types", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json",
    },
    body: "{",
  });
  assert.equal(r.status, 400);
  r = await f.call(f.base + "/instrument-types", {
    ...typeBody(),
    name: "x".repeat(9000),
  });
  assert.equal(r.status, 413);
  f.repository.failAudit = true;
  r = await f.call(f.base + "/instrument-types", typeBody());
  assert.equal(r.status, 503);
  assert.deepEqual(await r.json(), { error: "SERVICE_UNAVAILABLE" });
  assert.equal(f.repository.state.types.length, 0);
  assert.equal((await f.call(f.base + "/loads/release", {})).status, 404);
});

test("traceability uses its own centralized read permission before searching or reporting", async (t) => {
  const f = await fixture(t, {
    authorize: async (_scope, _capability, permission) =>
      permission !== "traceability:read",
  });
  assert.equal((await f.call(f.base + "/instruments")).status, 200);
  assert.equal((await f.call(f.base + "/traceability?code=DEMO")).status, 403);
  assert.equal(
    (await f.call(f.base + "/traceability/package/" + randomUUID())).status,
    403,
  );
});
