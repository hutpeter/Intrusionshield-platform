import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import { createSterileBrowserApp } from "../dist/security/browser.js";
import { MemoryRepository } from "../../../packages/sterile-processing/test/memory-repository.mjs";
async function fixture(t, patch = {}) {
  const tenantId = randomUUID(),
    actorId = randomUUID(),
    facilityId = randomUUID(),
    secret = randomBytes(48).toString("hex");
  let status = "ACTIVE",
    enabled = true,
    clock = Date.now(),
    outage = false,
    valid = true;
  const calls = [];
  const token = jwt.sign({ tenantId, identityType: "USER" }, secret, {
    algorithm: "HS256",
    issuer: "ruby",
    audience: "sterile",
    subject: actorId,
    expiresIn: 3600,
  });
  const repository = new MemoryRepository(),
    server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "https://127.0.0.1:" + server.address().port,
    transport = origin.replace("https:", "http:");
  const options = {
    origin,
    facilityId,
    facilityName: "Fictional facility",
    timeZone: "UTC",
    repository,
    authentication: {
      tenantId,
      issuer: "ruby",
      audience: "sterile",
      secret,
      maxLifetimeSeconds: 3600,
    },
    directory: {
      findUser: async () => {
        if (outage) throw new Error("private outage");
        return {
          tenantId,
          actorId,
          status: "ACTIVE",
          version: 1,
          facilities: [
            {
              facilityId,
              capabilityEnabled: enabled,
              permissions: ["instruments:read", "instruments:write"],
            },
          ],
        };
      },
    },
    identities: {
      findById: async () => ({ id: actorId, tenantId, type: "USER", status }),
    },
    signIn: async (input) => {
      calls.push({ ...input });
      return valid ? { accessToken: token } : null;
    },
    now: () => clock,
    ...patch,
  };
  const bff = createSterileBrowserApp(options);
  server.on("request", bff.app);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    bff.dispose();
  });
  let cookie = "",
    session;
  async function call(path, body, headers = {}, useCookie = cookie) {
    const r = await fetch(transport + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(useCookie ? { cookie: useCookie } : {}),
        ...(body === undefined
          ? {}
          : {
              origin,
              "content-type": "application/json",
              "x-sterile-csrf": session?.csrf ?? "",
            }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (r.headers.get("set-cookie"))
      cookie = r.headers.get("set-cookie").split(";")[0];
    return r;
  }
  async function boot() {
    const r = await call("/auth/session");
    assert.equal(r.status, 200);
    session = await r.json();
    return session;
  }
  async function login() {
    const r = await call("/auth/login", {
      username: "person",
      password: "fictional-password",
    });
    if (r.ok) session = await r.json();
    return r;
  }
  return {
    actorId,
    options,
    origin,
    token,
    repository,
    calls,
    call,
    boot,
    login,
    get session() {
      return session;
    },
    get cookie() {
      return cookie;
    },
    advance(ms) {
      clock += ms;
    },
    disable() {
      status = "DISABLED";
    },
    revoke() {
      enabled = false;
    },
    fail() {
      outage = true;
    },
    invalid() {
      valid = false;
    },
  };
}
test("browser login rotates cookie/CSRF, hides tokens, attributes writes and logout invalidates the old session", async (t) => {
  const f = await fixture(t);
  await f.boot();
  const anonymous = f.cookie,
    oldCsrf = f.session.csrf;
  const r = await f.login();
  assert.equal(r.status, 200);
  assert.notEqual(f.cookie, anonymous);
  assert.notEqual(f.session.csrf, oldCsrf);
  assert.match(
    r.headers.get("set-cookie"),
    /HttpOnly; Secure; SameSite=Strict/,
  );
  assert.equal(f.session.mode, "ruby-browser");
  assert.equal(f.session.actorId, f.actorId);
  assert.ok(!JSON.stringify(f.session).includes(f.token));
  assert.equal(f.session.accessToken, undefined);
  assert.equal(f.calls[0].tenantId, f.options.authentication.tenantId);
  assert.equal(f.session.timeZone, "UTC");
  const base = "/api/v1/sterile/facilities/" + f.options.facilityId;
  assert.equal(
    (
      await f.call(base + "/instrument-types", {
        requestId: randomUUID(),
        code: "AUTH-UI",
        name: "Fictional",
        manufacturer: "",
        model: "",
      })
    ).status,
    201,
  );
  assert.equal(f.repository.state.audit[0].actorId, f.session.actorId);
  const active = f.cookie;
  const logout = await f.call("/auth/logout", {});
  assert.equal(logout.status, 200);
  assert.notEqual(f.cookie, active);
  assert.equal(
    (await f.call(base + "/instruments", undefined, {}, active)).status,
    401,
  );
  assert.equal(
    (await f.call(base + "/instruments", undefined, {}, anonymous)).status,
    401,
  );
  await f.boot();
  assert.equal(f.session.authenticated, false);
  assert.equal((await f.login()).status, 200);
});
test("origin, CSRF, bearer mixing, duplicate cookies and forged login fields cannot authorize browser writes", async (t) => {
  const f = await fixture(t);
  await f.boot();
  for (const headers of [
    { "x-sterile-csrf": "" },
    { origin: "https://foreign.example" },
    { authorization: "Bearer " + f.token },
    { "sec-fetch-site": "cross-site" },
  ])
    assert.equal(
      (await f.call("/auth/login", { username: "p", password: "x" }, headers))
        .status,
      403,
    );
  assert.equal(
    (
      await f.call("/auth/login", {
        username: "p",
        password: "x",
        role: "reviewer",
      })
    ).status,
    400,
  );
  assert.equal((await f.login()).status, 200);
  const base = "/api/v1/sterile/facilities/" + f.options.facilityId;
  assert.equal(
    (
      await f.call(base + "/instruments", undefined, {
        authorization: "Bearer " + f.token,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.call(
        base + "/instruments",
        undefined,
        {},
        f.cookie + "; " + f.cookie,
      )
    ).status,
    401,
  );
  assert.equal(
    (await f.call("/auth/logout", {}, { "x-sterile-csrf": "" })).status,
    403,
  );
  assert.equal(
    (await f.call(base + "/instrument-types", {}, { "x-sterile-csrf": "" }))
      .status,
    403,
  );
  assert.equal((await f.call("/preview/session")).status, 404);
  assert.equal(f.repository.state.audit.length, 0);
});
test("absolute expiry, account disablement and revoked facility invalidate browser access", async (t) => {
  for (const action of ["expiry", "disabled", "revoked"]) {
    const f = await fixture(t);
    await f.boot();
    await f.login();
    const before = f.session.expiresAt;
    await f.boot();
    assert.equal(f.session.expiresAt, before);
    if (action === "expiry") f.advance(30 * 60_000 + 1);
    else if (action === "disabled") f.disable();
    else f.revoke();
    assert.equal(
      (
        await f.call(
          "/api/v1/sterile/facilities/" + f.options.facilityId + "/instruments",
        )
      ).status,
      401,
    );
    await f.boot();
    assert.equal(f.session.authenticated, false);
  }
});
test("invalid credentials are generic, failures disclose no detail and throttling is independent of new cookies", async (t) => {
  const f = await fixture(t);
  f.invalid();
  await f.boot();
  for (let i = 0; i < 10; i++) {
    const r = await f.login();
    assert.equal(r.status, 401);
    assert.deepEqual(await r.json(), { error: "UNAUTHENTICATED" });
  }
  const r = await f.login();
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "60");
  const freshSession = await (
    await f.call("/auth/session", undefined, {}, "")
  ).json();
  assert.equal(
    (
      await f.call(
        "/auth/login",
        { username: "person", password: "fictional-password" },
        { "x-sterile-csrf": freshSession.csrf },
      )
    ).status,
    429,
  );
  assert.equal(
    (
      await f.call(
        "/auth/login",
        { username: "person", password: "fictional-password" },
        { "x-sterile-csrf": freshSession.csrf, "content-type": "text/plain" },
      )
    ).status,
    400,
  );
  await f.boot();
  f.advance(60001);
  assert.equal((await f.login()).status, 401);
  const broken = await fixture(t, {
    signIn: async () => {
      throw new Error("secret backend detail");
    },
  });
  await broken.boot();
  const outage = await broken.login();
  assert.equal(outage.status, 503);
  assert.deepEqual(await outage.json(), { error: "SERVICE_UNAVAILABLE" });
  const active = await fixture(t);
  await active.boot();
  await active.login();
  active.fail();
  assert.equal((await active.call("/auth/session")).status, 503);
});
test("configuration requires HTTPS and explicit facility time zone", async (t) => {
  const f = await fixture(t);
  for (const patch of [
    { origin: "http://127.0.0.1" },
    { origin: f.origin + "/path" },
    { timeZone: "" },
    { timeZone: "not-a-zone" },
  ])
    assert.throws(() => createSterileBrowserApp({ ...f.options, ...patch }));
});
