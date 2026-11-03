import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSterilePreview } from "../dist/development/preview.js";
import { MemoryRepository } from "../../../packages/sterile-processing/test/memory-repository.mjs";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
async function fixture(t) {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  let clock = Date.now();
  const webRoot = mkdtempSync(join(tmpdir(), "sterile-public-entry-"));
  writeFileSync(
    join(webRoot, "index.html"),
    "<!doctype html><title>Public preview entry</title><h1>Preview welcome</h1>",
  );
  const repository = new MemoryRepository(),
    preview = createSterilePreview({
      origin,
      repository,
      webRoot,
      now: () => clock,
    });
  server.on("request", preview.app);
  t.after(
    () =>
      new Promise((resolve) => {
        preview.dispose();
        server.close(() => {
          rmSync(webRoot, { recursive: true, force: true });
          resolve();
        });
      }),
  );
  let cookie = "",
    session;
  async function call(path, { body, headers = {}, keepCookie = true } = {}) {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(cookie && keepCookie ? { cookie } : {}),
        ...(body !== undefined
          ? {
              origin,
              "content-type": "application/json",
              "x-sterile-csrf": session?.csrf ?? "",
            }
          : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value = response.headers.get("set-cookie");
    if (value) cookie = value.split(";")[0];
    return response;
  }
  async function bootstrap() {
    const r = await call("/preview/session");
    session = await r.json();
    return session;
  }
  async function login(role = "operator") {
    await bootstrap();
    const r = await call("/preview/login", { body: { role } });
    session = await r.json();
    return session;
  }
  return {
    origin,
    repository,
    call,
    bootstrap,
    login,
    get session() {
      return session;
    },
    get cookie() {
      return cookie;
    },
    expire() {
      clock += 31 * 60 * 1000;
    },
  };
}
test("requires same-origin CSRF confirmation, rotates sessions, and never returns the bridge credential", async (t) => {
  const f = await fixture(t),
    anon = await f.bootstrap(),
    old = f.cookie;
  assert.equal(anon.authenticated, false);
  assert.equal(
    (
      await f.call("/preview/login", {
        body: { role: "operator" },
        headers: { "x-sterile-csrf": "" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call("/preview/login", {
        body: { role: "operator" },
        headers: { origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call("/preview/login", {
        body: { role: "operator" },
        headers: { origin: "" },
      })
    ).status,
    403,
  );
  const s = await f.login();
  assert.equal(s.authenticated, true);
  assert.notEqual(f.cookie, old);
  assert.equal(Object.hasOwn(s, "token"), false);
  assert.equal(Object.hasOwn(s, "bearer"), false);
  const r = await f.call(
    "/api/v1/sterile/facilities/" + s.facilityId + "/instruments",
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await f.call("/preview/session", {
        headers: { "sec-fetch-site": "cross-site" },
      })
    ).status,
    403,
  );
});
test("allows operator writes, denies auditor writes, and preserves audit actor scope", async (t) => {
  const f = await fixture(t),
    s = await f.login(),
    base = "/api/v1/sterile/facilities/" + s.facilityId;
  const typeBody = {
    requestId: randomUUID(),
    code: "CLAMP",
    name: "Pinza",
    manufacturer: "",
    model: "",
  };
  const type = await (
    await f.call(base + "/instrument-types", { body: typeBody })
  ).json();
  const i = await (
    await f.call(base + "/instruments", {
      body: {
        requestId: randomUUID(),
        instrumentTypeId: type.id,
        code: "INS-1",
        serialNumber: "",
      },
    })
  ).json();
  const audit = await (
    await f.call(base + "/instruments/" + i.id + "/history")
  ).json();
  assert.equal(audit.items[0].actorId, s.actorId);
  assert.equal(
    (
      await f.call(
        base + "/instruments/" + i.id + "/history?tenantId=" + randomUUID(),
      )
    ).status,
    400,
  );
  await f.call("/preview/logout", { body: {} });
  const viewer = await f.login("viewer");
  assert.equal(viewer.canWrite, false);
  assert.equal((await f.call(base + "/instruments")).status, 200);
  assert.equal(
    (
      await f.call(base + "/instrument-types", {
        body: { ...typeBody, requestId: randomUUID(), code: "DENIED" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(base + "/instruments", {
        headers: { authorization: "Bearer browser-supplied" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.call(
        "/api/v1/sterile/facilities/" + randomUUID() + "/instruments",
      )
    ).status,
    404,
  );
});
test("revokes logout and expired sessions, rejects host spoofing and anonymous API access", async (t) => {
  const f = await fixture(t),
    s = await f.login(),
    base = "/api/v1/sterile/facilities/" + s.facilityId;
  const spoofed = await new Promise((resolve, reject) => {
    const req = httpRequest(
      f.origin + base + "/instruments",
      { headers: { host: "evil.example", cookie: f.cookie } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(spoofed, 403);
  f.expire();
  assert.equal((await f.call(base + "/instruments")).status, 401);
  assert.equal((await f.bootstrap()).authenticated, false);
  await f.login();
  const old = f.cookie;
  const logout = await f.call("/preview/logout", { body: {} });
  assert.equal(logout.status, 200);
  assert.equal(
    (await f.call(base + "/instruments", { headers: { cookie: old } })).status,
    401,
  );
  assert.equal(
    (await f.call(base + "/instruments", { keepCookie: false })).status,
    401,
  );
});
test("cannot be created in production or for a remote origin", () => {
  const old = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () =>
        createSterilePreview({
          origin: "http://127.0.0.1:9553",
          repository: new MemoryRepository(),
        }),
      /explicit development/,
    );
  } finally {
    process.env.NODE_ENV = old;
  }
  for (const origin of [
    "http://0.0.0.0:9553",
    "https://example.com",
    "http://127.0.0.1:9553/path",
  ])
    assert.throws(
      () =>
        createSterilePreview({ origin, repository: new MemoryRepository() }),
      /exact loopback/,
    );
});

function rawRequest(origin, path, headers, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = httpRequest(origin + path, { headers, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}
test("accepts a cross-site link to the public entry document without creating a session or exposing API data", async (t) => {
  const f = await fixture(t),
    navigation = {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    };
  const page = await rawRequest(f.origin, "/", navigation);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes("Preview welcome"));
  assert.equal(page.headers["set-cookie"], undefined);
  const head = await rawRequest(f.origin, "/", navigation, "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.text, "");
  for (const path of [
    "/preview/session",
    "/api/v1/sterile/facilities/00000000-0000-4000-8000-000000000001/instruments",
  ])
    assert.equal((await rawRequest(f.origin, path, navigation)).status, 403);
  assert.equal(f.repository.state.audit.length, 0);
});
test("continues rejecting cross-site fetches, iframes, forged hosts/origins and writes to the public root", async (t) => {
  const f = await fixture(t),
    navigation = {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
    };
  for (const headers of [
    { ...navigation, "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" },
    { ...navigation, "sec-fetch-dest": "iframe" },
    { ...navigation, origin: "https://evil.example" },
    { ...navigation, host: "evil.example" },
  ])
    assert.equal((await rawRequest(f.origin, "/", headers)).status, 403);
  assert.equal(
    (await rawRequest(f.origin, "/", navigation, "POST")).status,
    403,
  );
});
