import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { accountFixture } from "./accountAdmin.fixture.mjs";
import { createApp as authApp } from "../dist/app.js";
import { AccessTokenService } from "../dist/security/AccessTokenService.js";
import { createApp as hisApp } from "../../his/dist/app.js";
import { remoteAthenaAuthorization } from "../../his/dist/middleware/athenaAccess.js";
async function listen(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((r) => server.close(r)));
  return "http://127.0.0.1:" + server.address().port;
}
test("real signed token -> account authorization -> HIS gate: viewer/editor, client boundaries, revocation and admin separation", async (t) => {
  const f = accountFixture(),
    tokens = new AccessTokenService({
      secret: "athena-api-test-secret-at-least-32-characters",
      issuer: "athena-api-test",
      audience: "test",
      lifetimeSeconds: 3600,
    });
  await f.accounts.prepareAthenaRoles(f.principal(f.root), f.tenantA, {
    reason: "Cross-service verification",
  });
  const viewer = f.store.state.roles.find((r) => r.name === "Athena viewer"),
    editor = f.store.state.roles.find((r) => r.name === "Athena editor");
  const currentUser = () =>
    f.store.state.users.find((x) => x.id === f.regular.id);
  currentUser().roleIds = [viewer.id];
  currentUser().facilityIds = [];
  const token = (x) =>
    tokens.issue({
      sub: x.id,
      tenantId: x.tenantId,
      identityType: "USER",
      displayName: x.displayName,
      language: "en",
      languageSource: "USER",
      sessionVersion: x.sessionVersion,
    }).token;
  const auth = await listen(
    t,
    authApp(undefined, undefined, {
      accounts: f.accounts,
      tokens,
      allowInsecureLoopback: true,
    }),
  );
  const calls = [];
  const service = {
    list: async (input) => {
      calls.push(input);
      return { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 };
    },
    create: async (input) => {
      calls.push(input);
      return input;
    },
  };
  const his = await listen(
    t,
    hisApp({ personService: service }, remoteAthenaAuthorization(auth)),
  );
  const call = (
    bearer,
    method = "GET",
    headers = {},
    path = "/persons",
    body,
  ) =>
    fetch(his + "/api/v1/his" + path, {
      method,
      headers: {
        ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await call()).status, 401);
  assert.equal((await call("bad-token")).status, 401);
  assert.equal(calls.length, 0);
  const bearer = token(currentUser());
  assert.equal((await call(bearer)).status, 200);
  assert.equal(calls.at(-1).tenantId, f.tenantA);
  const count = calls.length;
  assert.equal((await call(bearer, "POST", {}, "/persons", {})).status, 403);
  assert.equal(calls.length, count);
  assert.equal(
    (await call(bearer, "GET", { "x-tenant-id": f.tenantB })).status,
    403,
  );
  assert.equal(calls.length, count);
  assert.equal((await call(token(f.root))).status, 403);
  assert.equal((await call(token(f.admin))).status, 403);
  await f.accounts.prepareAthenaRoles(f.principal(f.root), f.tenantB, {
    reason: "Verify second client isolation",
  });
  const foreign = f.store.state.users.find((x) => x.id === f.foreign.id);
  foreign.facilityIds = [];
  foreign.roleIds = [
    f.store.state.roles.find(
      (r) => r.tenantId === f.tenantB && r.name === "Athena viewer",
    ).id,
  ];
  assert.equal((await call(token(foreign))).status, 200);
  assert.equal(calls.at(-1).tenantId, f.tenantB);
  const afterForeignRead = calls.length;
  assert.equal(
    (await call(token(foreign), "GET", { "x-tenant-id": f.tenantA })).status,
    403,
  );
  assert.equal(calls.length, afterForeignRead);
  currentUser().roleIds = [editor.id];
  const created = await call(bearer, "POST", {}, "/persons", {
    firstName: "Fictional",
    lastName: "Tester",
    tenantId: f.tenantB,
  });
  assert.equal(created.status, 201);
  const createdPerson = await created.json();
  assert.equal(createdPerson.tenantId, f.tenantA);
  assert.equal(calls.at(-1).tenantId, f.tenantA);
  assert.equal(
    (await call(bearer, "DELETE", {}, "/persons/anything")).status,
    405,
  );
  assert.equal(
    (await call(bearer, "PUT", {}, "/no-such-resource", {})).status,
    404,
  );
  // Reuse same token after direct role revocation: database authority, not token role claims, decides.
  currentUser().roleIds = [];
  assert.equal((await call(bearer)).status, 403);
  currentUser().roleIds = [viewer.id];
  currentUser().status = "DISABLED";
  assert.equal((await call(bearer)).status, 401);
  currentUser().status = "ACTIVE";
  currentUser().sessionVersion++;
  assert.equal((await call(bearer)).status, 401);
  currentUser().facilityIds = [f.facility];
  const limited = await call(token(currentUser()));
  assert.equal(limited.status, 403);
  assert.equal(
    (await limited.json()).error,
    "ATHENA_FACILITY_SCOPE_UNSUPPORTED",
  );
  assert.ok(calls.every((x) => [f.tenantA, f.tenantB].includes(x.tenantId)));
});
test("HIS denies when authorization is absent, unavailable, malformed or redirects", async (t) => {
  const app = hisApp({
    personService: {
      list: async () => {
        throw Error("Must not reach data");
      },
    },
  });
  const base = await listen(t, app);
  assert.equal(
    (
      await fetch(base + "/api/v1/his/persons", {
        headers: { Authorization: "Bearer sample" },
      })
    ).status,
    503,
  );
  assert.throws(() => remoteAthenaAuthorization("http://remote.example"));
  assert.throws(() =>
    remoteAthenaAuthorization("https://trusted.example/other"),
  );
  assert.throws(() =>
    remoteAthenaAuthorization("https://user:password@trusted.example"),
  );
  const express = (await import("express")).default;
  for (const mode of ["malformed", "redirect", "unavailable"]) {
    const mock = express();
    mock.post("/api/v1/admin/accounts/athena-access", (_req, res) =>
      mode === "malformed"
        ? res.json({ tenantId: "not-uuid" })
        : mode === "redirect"
          ? res.redirect(307, "/elsewhere")
          : res.status(500).end(),
    );
    const remote = remoteAthenaAuthorization(await listen(t, mock));
    await assert.rejects(
      () => remote("sample", "READ"),
      (e) => e.status === 503,
    );
  }
});
