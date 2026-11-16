import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AccountAdministration } from "../dist/accounts/service.js";
import { AccountError } from "../dist/accounts/model.js";
import { createApp } from "../dist/app.js";
import { AccessTokenService } from "../dist/security/AccessTokenService.js";
import { PasswordHasher } from "../dist/security/PasswordHasher.js";
import { SqlAccountStore } from "../dist/accounts/sql.js";
import { accountFixture } from "./accountAdmin.fixture.mjs";
const rejects = (fn, status, code) =>
  assert.rejects(fn, (e) => e.status === status && (!code || e.code === code));
test("superuser creates client admin; client admin creates only own-client regular users with separate job roles", async () => {
  const f = accountFixture(),
    p = f.principal(f.root);
  const created = await f.accounts.create(
    p,
    f.tenantA,
    f.input({
      username: "client.admin",
      email: "admin2@example.invalid",
      kind: "CLIENT_ADMIN",
    }),
  );
  assert.equal(created.user.status, "PENDING");
  assert.equal(created.user.kind, "CLIENT_ADMIN");
  assert.equal(created.setupToken.length, 43);
  assert.equal(f.store.state.credentials.length, 0);
  assert.equal(
    JSON.stringify(f.store.state).includes(created.setupToken),
    false,
  );
  await f.accounts.complete({
    token: created.setupToken,
    password: "Private administrator password 123",
  });
  const admin = created.user,
    regular = await f.accounts.create(f.principal(admin), f.tenantA, f.input());
  assert.equal(regular.user.kind, "USER");
  assert.equal((await f.accounts.tenants(f.principal(admin))).length, 1);
  assert.equal((await f.accounts.tenants(p)).length, 2);
  await rejects(
    () => f.accounts.create(f.principal(admin), f.tenantB, f.input()),
    403,
  );
  await rejects(
    () =>
      f.accounts.create(
        f.principal(admin),
        f.tenantA,
        f.input({ kind: "CLIENT_ADMIN" }),
      ),
    403,
  );
  await rejects(
    () => f.accounts.create(f.principal(f.regular), f.tenantA, f.input()),
    403,
  );
  await rejects(
    () => f.accounts.create(p, f.tenantA, f.input({ kind: "SUPERUSER" })),
    400,
  );
});
test("client administrators cannot delegate higher roles, administrative roles, foreign roles or unassigned facility/product access", async () => {
  const f = accountFixture(),
    p = f.principal(f.admin),
    before = structuredClone(f.store.state);
  for (const patch of [
    { roleIds: [f.highRole] },
    { roleIds: [f.foreignRole] },
    { roleIds: [f.adminRole] },
    { facilityIds: [randomUUID()] },
    { productKeys: ["ems"] },
    { kind: "SUPERUSER" },
  ])
    await assert.rejects(() => f.accounts.create(p, f.tenantA, f.input(patch)));
  assert.deepEqual(f.store.state, before);
  assert.deepEqual(
    (await f.accounts.roles(p, f.tenantA)).map((x) => x.id),
    [f.role],
  );
});
test("password setup is one-use, bounded, hashed, scoped and audited without exposing passwords or raw tokens", async () => {
  const f = accountFixture(),
    r = await f.accounts.create(f.principal(f.admin), f.tenantA, f.input()),
    password = "Private user password 🔒 123";
  assert.deepEqual(
    await f.accounts.complete({ token: r.setupToken, password }),
    { configured: true },
  );
  assert.equal(
    await new PasswordHasher().verify(
      password,
      f.store.state.credentials[0].hash,
    ),
    true,
  );
  assert.equal(
    f.store.state.users.find((u) => u.id === r.user.id).status,
    "ACTIVE",
  );
  await rejects(
    () => f.accounts.complete({ token: r.setupToken, password }),
    400,
  );
  assert.equal(JSON.stringify(f.store.state).includes(password), false);
  assert.equal(
    JSON.stringify(f.store.state.audit).includes(r.setupToken),
    false,
  );
  const next = await f.accounts.create(
    f.principal(f.admin),
    f.tenantA,
    f.input({ username: "expired", email: "expired@example.invalid" }),
  );
  f.advance();
  await rejects(
    () => f.accounts.complete({ token: next.setupToken, password }),
    400,
  );
});
test("disable/re-enable and reset invalidate prior administration sessions; reset rotates setup links without changing access/person mapping", async () => {
  const f = accountFixture(),
    r = await f.accounts.create(
      f.principal(f.root),
      f.tenantA,
      f.input({ kind: "CLIENT_ADMIN", personId: randomUUID() }),
    );
  await f.accounts.complete({
    token: r.setupToken,
    password: "First private password 123",
  });
  const old = f.principal(r.user);
  assert.equal((await f.accounts.context(old)).kind, "CLIENT_ADMIN");
  const u = f.store.state.users.find((u) => u.id === r.user.id),
    snapshot = structuredClone(u);
  const reset = await f.accounts.reset(f.principal(f.root), f.tenantA, u.id, {
    version: u.version,
    reason: "Owner requested recovery",
  });
  await rejects(() => f.accounts.context(old), 401);
  const rotated = await f.accounts.reset(f.principal(f.root), f.tenantA, u.id, {
    version: reset.user.version,
    reason: "Replace lost link",
  });
  await rejects(
    () =>
      f.accounts.complete({
        token: reset.setupToken,
        password: "Another private password 123",
      }),
    400,
  );
  await f.accounts.complete({
    token: rotated.setupToken,
    password: "Replacement private password 123",
  });
  await rejects(() => f.accounts.context(old), 401);
  const after = f.store.state.users.find((u) => u.id === r.user.id);
  assert.deepEqual(after.roleIds, snapshot.roleIds);
  assert.deepEqual(after.facilityIds, snapshot.facilityIds);
  assert.equal(after.personId, snapshot.personId);
  const session = f.principal(after),
    disabled = await f.accounts.status(
      f.principal(f.root),
      f.tenantA,
      after.id,
      { version: after.version, enabled: false, reason: "Disable test" },
    );
  await rejects(() => f.accounts.context(session), 401);
  await f.accounts.status(f.principal(f.root), f.tenantA, after.id, {
    version: disabled.user.version,
    enabled: true,
    reason: "Re-enable test",
  });
  await rejects(() => f.accounts.context(session), 401);
});
test("password reset and status changes cannot take over a more privileged regular user, a peer admin, superuser, or self", async () => {
  const f = accountFixture(),
    p = f.principal(f.admin);
  f.store.state.users.find((u) => u.id === f.regular.id).roleIds = [f.highRole];
  await rejects(
    () =>
      f.accounts.reset(p, f.tenantA, f.regular.id, {
        version: 1,
        reason: "escalate",
      }),
    403,
  );
  await rejects(
    () =>
      f.accounts.status(p, f.tenantA, f.regular.id, {
        version: 1,
        enabled: false,
        reason: "escalate",
      }),
    403,
  );
  for (const u of [f.admin, f.root])
    await rejects(
      () =>
        f.accounts.status(p, u.tenantId, u.id, {
          version: 1,
          enabled: false,
          reason: "not permitted",
        }),
      403,
    );
  await rejects(
    () =>
      f.accounts.reset(f.principal(f.root), f.tenantA, f.root.id, {
        version: 1,
        reason: "self",
      }),
    403,
  );
});
test("strict fields and versions prevent spoofing, duplicate assignments and lost changes; person mapping is immutable", async () => {
  const f = accountFixture(),
    p = f.principal(f.root);
  for (const patch of [
    { actorId: randomUUID() },
    { status: "ACTIVE" },
    { password: "do-not-accept" },
    { sessionVersion: 0 },
    { roleIds: [f.role, f.role] },
    { productKeys: ["athena", "athena"] },
  ])
    await rejects(() => f.accounts.create(p, f.tenantA, f.input(patch)), 400);
  const made = await f.accounts.create(
      p,
      f.tenantA,
      f.input({ personId: randomUUID() }),
    ),
    u = made.user;
  const change = {
    kind: "USER",
    personId: u.personId,
    roleIds: [f.role],
    facilityIds: [f.facility],
    productKeys: ["athena"],
    version: 1,
    reason: "Access update",
  };
  await rejects(
    () =>
      f.accounts.accessChange(p, f.tenantA, u.id, {
        ...change,
        personId: randomUUID(),
      }),
    409,
    "PERSON_MAPPING_IMMUTABLE",
  );
  const result = await Promise.allSettled([
    f.accounts.accessChange(p, f.tenantA, u.id, change),
    f.accounts.accessChange(p, f.tenantA, u.id, change),
  ]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    result.filter(
      (x) => x.status === "rejected" && x.reason.code === "STALE_ACCOUNT",
    ).length,
    1,
  );
  await rejects(() => f.accounts.create(p, f.tenantA, f.input()), 409);
});
test("audit failure rolls back account, role grants, setup links, password changes and status", async () => {
  const f = accountFixture(),
    before = structuredClone(f.store.state);
  f.store.failAudit = true;
  await assert.rejects(
    () => f.accounts.create(f.principal(f.root), f.tenantA, f.input()),
    /audit/,
  );
  assert.deepEqual(f.store.state, before);
  f.store.failAudit = false;
  const r = await f.accounts.create(f.principal(f.root), f.tenantA, f.input());
  const snapshot = structuredClone(f.store.state);
  f.store.failAudit = true;
  await assert.rejects(
    () =>
      f.accounts.complete({
        token: r.setupToken,
        password: "Private test password 123",
      }),
    /audit/,
  );
  assert.deepEqual(f.store.state, snapshot);
  f.store.failAudit = false;
  await f.accounts.complete({
    token: r.setupToken,
    password: "Private test password 123",
  });
});
test("metadata alone never grants superuser authority and current role revocation is effective immediately", async () => {
  const f = accountFixture();
  f.store.state.users.find((u) => u.id === f.regular.id).kind = "SUPERUSER";
  await rejects(() => f.accounts.list(f.principal(f.regular), f.tenantA), 403);
  f.store.state.admins = [];
  await rejects(() => f.accounts.list(f.principal(f.admin), f.tenantA), 403);
});
test("disabled/suspended client prevents new accounts and setup without crossing scope", async () => {
  const f = accountFixture(),
    r = await f.accounts.create(f.principal(f.root), f.tenantA, f.input());
  f.store.state.tenants.find((t) => t.id === f.tenantA).status = "SUSPENDED";
  await rejects(
    () =>
      f.accounts.complete({
        token: r.setupToken,
        password: "Private test password 123",
      }),
    409,
  );
  await rejects(
    () => f.accounts.create(f.principal(f.root), f.tenantA, f.input()),
    409,
  );
});
test("SQL store creates a fresh transaction per request, rolls back on failure, and closes each provider", async () => {
  const calls = [];
  const store = new SqlAccountStore(() => ({
    connect: async () => calls.push("connect"),
    beginTransaction: async () => calls.push("begin"),
    commitTransaction: async () => calls.push("commit"),
    rollbackTransaction: async () => calls.push("rollback"),
    disconnect: async () => calls.push("close"),
  }));
  await assert.rejects(
    () =>
      store.transaction(async () => {
        throw Error("simulate write failure");
      }),
    /simulate/,
  );
  assert.deepEqual(calls, ["connect", "begin", "rollback", "close"]);
  calls.length = 0;
  assert.equal(await store.transaction(async () => 42), 42);
  assert.deepEqual(calls, ["connect", "begin", "commit", "close"]);
});
test("HTTP requires valid signed user tokens, rejects cross-client and mass assignment, and does not reveal setup hashes", async (t) => {
  const f = accountFixture(),
    tokens = new AccessTokenService({
      secret: "test-secret-material-at-least-32-characters",
      issuer: "account-admin-test",
      audience: "test",
      lifetimeSeconds: 3600,
    });
  const token = (u) =>
    tokens.issue({
      sub: u.id,
      tenantId: u.tenantId,
      identityType: "USER",
      displayName: u.displayName,
      language: "en",
      languageSource: "USER",
      sessionVersion: 1,
    }).token;
  const server = createApp(undefined, undefined, {
    accounts: f.accounts,
    tokens,
    allowInsecureLoopback: true,
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const url =
    "http://127.0.0.1:" + server.address().port + "/api/v1/admin/accounts";
  const call = (path, method = "GET", u, body) =>
    fetch(url + path, {
      method,
      headers: {
        ...(u ? { Authorization: "Bearer " + token(u) } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await call("/context")).status, 401);
  assert.equal(
    (
      await call(
        "/clients/" + f.tenantA + "/users",
        "POST",
        f.regular,
        f.input(),
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/clients/" + f.tenantB + "/users", "GET", f.admin)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/clients/" + f.tenantA + "/users",
        "POST",
        f.admin,
        f.input({ tenantId: f.tenantB }),
      )
    ).status,
    400,
  );
  const r = await call(
    "/clients/" + f.tenantA + "/users",
    "POST",
    f.admin,
    f.input(),
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const body = await r.json();
  assert.ok(body.setupToken);
  assert.equal(JSON.stringify(body).includes("hash"), false);
  const list = await (
    await call("/clients/" + f.tenantA + "/users", "GET", f.admin)
  ).json();
  assert.equal(JSON.stringify(list).includes(body.setupToken), false);
  const finish = await fetch(url + "/complete-setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: body.setupToken,
      password: "Private test password 123",
    }),
  });
  assert.equal(finish.status, 200);
  assert.equal(
    (await call("/clients/" + f.tenantA + "/users?offset=no", "GET", f.admin))
      .status,
    400,
  );
});

test("managed login issues a verified session version and setup-pending accounts cannot obtain an unrestricted token", async () => {
  const { AuthenticationService } =
    await import("../dist/application/AuthenticationService.js");
  const f = accountFixture(),
    hasher = new PasswordHasher(),
    hash = await hasher.hash("Private login password 12345");
  const tokens = new AccessTokenService({
    secret: "test-session-secret-material-at-least-32",
    issuer: "session-test",
    audience: "test",
    lifetimeSeconds: 3600,
  });
  const service = new AuthenticationService(
    {
      findUserByUsername: async () => ({
        identityId: f.admin.id,
        tenantId: f.tenantA,
        identityType: "USER",
        status: "ACTIVE",
        displayName: "Admin",
        username: "admin",
        email: "admin@example.invalid",
        passwordHash: hash,
        preferredLanguage: "en",
      }),
    },
    { getInternationalizationSettings: async () => null },
    hasher,
    tokens,
    f.accounts,
  );
  const result = await service.authenticate({
      tenantId: f.tenantA,
      username: "admin",
      password: "Private login password 12345",
    }),
    claims = tokens.verify(result.accessToken);
  assert.equal(claims.sessionVersion, 1);
  f.store.state.users.find((u) => u.id === f.admin.id).requiresSetup = true;
  await assert.rejects(() =>
    service.authenticate({
      tenantId: f.tenantA,
      username: "admin",
      password: "Private login password 12345",
    }),
  );
  const malformed = tokens.issue({
    sub: f.admin.id,
    tenantId: f.tenantA,
    identityType: "USER",
    displayName: "Admin",
    language: "en",
    languageSource: "USER",
    sessionVersion: "forged",
  }).token;
  assert.throws(() => tokens.verify(malformed));
  await rejects(
    () => f.accounts.context({ tenantId: f.tenantA, id: f.regular.id }),
    401,
  );
});
test("public password setup is rate limited and HTTP transport is refused unless explicitly allowed on loopback", async (t) => {
  const f = accountFixture(),
    tokens = new AccessTokenService({
      secret: "rate-limit-test-key-material-at-least-32",
      issuer: "rate-test",
      audience: "test",
      lifetimeSeconds: 3600,
    });
  async function server(allow) {
    const s = createApp(undefined, undefined, {
      accounts: f.accounts,
      tokens,
      allowInsecureLoopback: allow,
    }).listen(0, "127.0.0.1");
    await new Promise((r) => s.once("listening", r));
    t.after(() => new Promise((r) => s.close(r)));
    return "http://127.0.0.1:" + s.address().port + "/api/v1/admin/accounts";
  }
  const denied = await server(false);
  assert.equal((await fetch(denied + "/context")).status, 403);
  const url = await server(true),
    before = structuredClone(f.store.state);
  for (let i = 0; i < 11; i++) {
    const r = await fetch(url + "/complete-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: "x".repeat(43),
        password: "Private unknown account password 123",
      }),
    });
    assert.equal(r.status, i === 10 ? 429 : 400);
  }
  assert.deepEqual(f.store.state, before);
});

test("SQL password/status persistence preserves role assignments, while explicit access edits replace only scoped tenant roles", async () => {
  const f = accountFixture(),
    calls = [];
  const db = {
    connect: async () => {},
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    disconnect: async () => {},
    execute: async (sql, parameters) => {
      calls.push({ sql, parameters });
      return 1;
    },
    query: async () => ({ rows: [] }),
  };
  const store = new SqlAccountStore(() => db),
    user = { ...f.regular, version: 2, sessionVersion: 2 };
  await store.transaction((tx) => tx.save(user, 1));
  assert.equal(
    calls.some((c) => c.sql.includes("DELETE FROM [Identity].[IdentityRoles]")),
    false,
  );
  assert.ok(
    calls
      .find((c) => c.sql.includes("UPDATE [Identity].[UserAdministration]"))
      .sql.includes("Version=@expected"),
  );
  calls.length = 0;
  await store.transaction((tx) => tx.save(user, 1, true));
  const remove = calls.find((c) =>
    c.sql.includes("DELETE FROM [Identity].[IdentityRoles]"),
  );
  assert.ok(remove.sql.includes("TenantId=@tenantId AND IdentityId=@id"));
  assert.ok(
    calls.some((c) => c.sql.includes("INSERT INTO [Identity].[IdentityRoles]")),
  );
  calls.length = 0;
  const marker = "scrypt$private'parameter$hash";
  await store.transaction((tx) => tx.credential(user, marker));
  assert.equal(calls[0].sql.includes(marker), false);
  assert.ok(
    calls[0].parameters.some((p) => p.name === "hash" && p.value === marker),
  );
});

test("client registration UI capability fails closed for ordinary users and disabled server configuration", async (t) => {
  const f = accountFixture(),
    tokens = new AccessTokenService({
      secret: "capability-test-secret-material-long-enough",
      issuer: "capability-test",
      audience: "test",
      lifetimeSeconds: 3600,
    });
  let checks = 0;
  const server = createApp(undefined, undefined, {
    accounts: f.accounts,
    tokens,
    allowInsecureLoopback: true,
    canCreateClients: async () => {
      checks++;
      return true;
    },
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => new Promise((r) => server.close(r)));
  const url =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/v1/admin/accounts/client-creation";
  const call = (u) =>
    fetch(url, {
      headers: {
        Authorization:
          "Bearer " +
          tokens.issue({
            sub: u.id,
            tenantId: u.tenantId,
            identityType: "USER",
            displayName: u.displayName,
            language: "en",
            languageSource: "USER",
            sessionVersion: 1,
          }).token,
      },
    });
  assert.equal((await (await call(f.root)).json()).enabled, true);
  assert.equal((await (await call(f.admin)).json()).enabled, false);
  assert.equal((await (await call(f.regular)).json()).enabled, false);
  assert.equal(checks, 1);
});

test("optional person and facility fields accept blank input; invalid supplied IDs identify the actual field", async () => {
  const f = accountFixture(),
    p = f.principal(f.root);
  for (const [i, personId] of [null, "", "   "].entries()) {
    const result = await f.accounts.create(
      p,
      f.tenantA,
      f.input({
        username: "optional.user." + i,
        email: "optional" + i + "@example.invalid",
        personId,
        facilityIds: [],
        roleIds: [],
        productKeys: [],
      }),
    );
    assert.equal(result.user.personId, null);
    assert.deepEqual(result.user.facilityIds, []);
    assert.equal(result.user.status, "PENDING");
  }
  const count = f.store.state.users.length;
  await rejects(
    () =>
      f.accounts.create(
        p,
        f.tenantA,
        f.input({ personId: "not-a-person-id", facilityIds: [] }),
      ),
    400,
    "INVALID_PERSON_ID",
  );
  await rejects(
    () =>
      f.accounts.create(
        p,
        f.tenantA,
        f.input({ personId: null, facilityIds: ["Athena tester"] }),
      ),
    400,
    "INVALID_FACILITY_ID",
  );
  assert.equal(f.store.state.users.length, count);
});

test("Athena role setup is superuser-only, audited, idempotent and assigns no users automatically", async () => {
  const f = accountFixture(),
    root = f.principal(f.root),
    before = f.store.state.users.map((u) => structuredClone(u));
  await rejects(
    () =>
      f.accounts.prepareAthenaRoles(f.principal(f.admin), f.tenantA, {
        reason: "No escalation",
      }),
    403,
    "SUPERUSER_REQUIRED",
  );
  const first = await f.accounts.prepareAthenaRoles(root, f.tenantA, {
    reason: "Initial Athena role setup",
  });
  const second = await f.accounts.prepareAthenaRoles(root, f.tenantA, {
    reason: "Check role setup",
  });
  assert.deepEqual(first.roleIds, second.roleIds);
  assert.deepEqual(f.store.state.users, before);
  assert.ok(
    (await f.accounts.history(root, f.tenantA)).some(
      (e) => e.action === "ATHENA_ROLES_PREPARED",
    ),
  );
  f.store.failAudit = true;
  await assert.rejects(() =>
    f.accounts.prepareAthenaRoles(root, f.tenantB, {
      reason: "Rollback this role setup",
    }),
  );
  assert.equal(
    f.store.state.roles.some(
      (r) => r.tenantId === f.tenantB && r.name === "Athena viewer",
    ),
    false,
  );
});
test("Athena current session requires explicit product and tenant job permissions; administration confers no data access", async () => {
  const f = accountFixture(),
    root = f.principal(f.root);
  await f.accounts.prepareAthenaRoles(root, f.tenantA, {
    reason: "Product policy test",
  });
  const viewer = f.store.state.roles.find((r) => r.name === "Athena viewer"),
    editor = f.store.state.roles.find((r) => r.name === "Athena editor");
  const currentUser = () =>
    f.store.state.users.find((u) => u.id === f.regular.id);
  currentUser().facilityIds = [];
  currentUser().roleIds = [viewer.id];
  const p = f.principal(currentUser());
  assert.equal(
    (await f.accounts.athenaAccess(p, { action: "READ" })).tenantId,
    f.tenantA,
  );
  await rejects(
    () => f.accounts.athenaAccess(p, { action: "WRITE" }),
    403,
    "ATHENA_ACCESS_REQUIRED",
  );
  await rejects(
    () => f.accounts.athenaAccess(root, { action: "READ" }),
    403,
    "ATHENA_ACCESS_REQUIRED",
  );
  const admin = f.store.state.users.find((u) => u.id === f.admin.id);
  admin.roleIds = [];
  admin.facilityIds = [];
  await rejects(
    () => f.accounts.athenaAccess(f.principal(admin), { action: "READ" }),
    403,
    "ATHENA_ACCESS_REQUIRED",
  );
  currentUser().roleIds = [editor.id];
  assert.equal(
    (await f.accounts.athenaAccess(p, { action: "WRITE" })).action,
    "WRITE",
  );
  currentUser().productKeys = [];
  await rejects(
    () => f.accounts.athenaAccess(p, { action: "READ" }),
    403,
    "ATHENA_ACCESS_REQUIRED",
  );
  currentUser().productKeys = ["athena"];
  currentUser().facilityIds = [f.facility];
  await rejects(
    () => f.accounts.athenaAccess(p, { action: "READ" }),
    403,
    "ATHENA_FACILITY_SCOPE_UNSUPPORTED",
  );
  currentUser().facilityIds = [];
  currentUser().sessionVersion++;
  await rejects(
    () => f.accounts.athenaAccess(p, { action: "READ" }),
    401,
    "SIGN_IN_REQUIRED",
  );
  await rejects(
    () =>
      f.accounts.athenaAccess(f.principal(currentUser()), {
        action: "READ",
        tenantId: f.tenantB,
      }),
    400,
    "INVALID_FIELDS",
  );
});
