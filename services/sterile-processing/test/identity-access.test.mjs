import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  chmodSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import jwt from "jsonwebtoken";
import {
  createRubySterileAccess,
  createRubyAuthenticatedSterileApp,
} from "../dist/security/access.js";
import { SqliteSterileAccessDirectory } from "../dist/security/sqlite-access.js";
import { MemoryRepository } from "../../../packages/sterile-processing/test/memory-repository.mjs";

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), "sterile-access-")),
    file = join(dir, "access.sqlite");
  let directory = new SqliteSterileAccessDirectory(file);
  const configuration = {
    tenantId: randomUUID(),
    issuer: "ruby-test-auth",
    audience: "ruby-sterile-test",
    secret: randomBytes(48).toString("hex"),
    maxLifetimeSeconds: 900,
  };
  const actorId = randomUUID(),
    admin = randomUUID(),
    facilityId = randomUUID();
  const user = {
    tenantId: configuration.tenantId,
    actorId,
    status: "ACTIVE",
    facilities: [
      {
        facilityId,
        capabilityEnabled: true,
        permissions: ["instruments:read", "instruments:write"],
      },
    ],
  };
  t.after(() => {
    directory.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const changes = {
    changedBy: admin,
    reason: "Fictional trusted administration",
  };
  function save(input = user, expectedVersion = 0) {
    return directory.replaceAccess(input, { ...changes, expectedVersion });
  }
  function token(overrides = {}, options = {}) {
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: configuration.issuer,
      aud: configuration.audience,
      sub: actorId,
      tenantId: configuration.tenantId,
      identityType: "USER",
      displayName: "Fictional user",
      language: "en",
      languageSource: "USER",
      iat: now,
      exp: now + 600,
      ...overrides,
    };
    for (const key of Object.keys(claims))
      if (claims[key] === undefined) delete claims[key];
    return jwt.sign(claims, configuration.secret, {
      algorithm: "HS256",
      ...options,
    });
  }
  const identities = {
    findById: async (id, tenantId) =>
      id === actorId && tenantId === configuration.tenantId
        ? { id, tenantId, type: "USER", status: "ACTIVE" }
        : null,
  };
  return {
    identities,
    configuration,
    actorId,
    facilityId,
    user,
    save,
    token,
    file,
    dir,
    changes,
    get directory() {
      return directory;
    },
    reopen() {
      directory.close();
      directory = new SqliteSterileAccessDirectory(file);
    },
    scope: { tenantId: configuration.tenantId, actorId, facilityId },
  };
}
test("Ruby signed USER token resolves enrolled identity; facility and granular permissions come from the directory", async (t) => {
  const f = setup(t);
  f.save();
  const access = createRubySterileAccess(
    f.configuration,
    f.directory,
    f.identities,
  );
  assert.deepEqual(
    await access.authenticate(
      f.token({ roles: ["admin"], facilityIds: [randomUUID()] }),
    ),
    {
      tenantId: f.configuration.tenantId,
      actorId: f.actorId,
      facilityIds: [f.facilityId],
    },
  );
  assert.equal(
    await access.authorize(f.scope, "sterile.core", "instruments:write"),
    true,
  );
  assert.equal(
    await access.authorize(f.scope, "sterile.core", "release:write"),
    false,
  );
  assert.equal(
    await access.authorize(
      { ...f.scope, facilityId: randomUUID() },
      "sterile.core",
      "instruments:read",
    ),
    false,
  );
  assert.equal(
    await access.authorize(
      { ...f.scope, tenantId: randomUUID() },
      "sterile.core",
      "instruments:read",
    ),
    false,
  );
  assert.equal(
    await access.authorize(f.scope, "other", "instruments:read"),
    false,
  );
});
test("invalid signature, untrusted scope, service identities and unsupported JWT forms cannot authenticate", async (t) => {
  const f = setup(t);
  f.save();
  const access = createRubySterileAccess(
    f.configuration,
    f.directory,
    f.identities,
  );
  const now = Math.floor(Date.now() / 1000),
    badTokens = [
      "not-a-token",
      "",
      f.token() + " ",
      "x".repeat(8193),
      f.token({ iss: "other" }),
      f.token({ aud: "other" }),
      f.token({ aud: [f.configuration.audience, "other"] }),
      f.token({ tenantId: randomUUID() }),
      f.token({ sub: randomUUID() }),
      f.token({ sub: "bad" }),
      ...["SERVICE", "APPLICATION", "API", "ADMIN", null].map((identityType) =>
        f.token({ identityType }),
      ),
      f.token({ exp: now - 1 }),
      f.token({ nbf: now + 120 }),
      f.token({ iat: now + 60 }),
      f.token({ iat: now - 1000 }),
      f.token({ exp: now + 901 }),
      f.token({ exp: now }),
      f.token({ exp: undefined }),
      f.token({}, { noTimestamp: true }),
      f.token({}, { algorithm: "HS384" }),
      f.token({}, { header: { typ: "at+jwt", alg: "HS256" } }),
      f.token({}, { header: { typ: "JWT", alg: "HS256", crit: ["unknown"] } }),
      jwt.sign({ sub: f.actorId }, randomBytes(48).toString("hex"), {
        algorithm: "HS256",
      }),
    ];
  const parts = f.token().split(".");
  parts[1] = Buffer.from(
    JSON.stringify({
      sub: f.actorId,
      tenantId: f.configuration.tenantId,
      roles: ["admin"],
    }),
  ).toString("base64url");
  badTokens.push(parts.join("."));
  for (const value of badTokens)
    assert.equal(
      await access.authenticate(value),
      null,
      "bad token must be denied",
    );
  const noGrant = { ...f.user, facilities: [] };
  f.save(noGrant, 1);
  assert.equal(await access.authenticate(f.token()), null);
});
test("valid tokens cannot enroll users or revive disabled access; grants and capability are rechecked without caches", async (t) => {
  const f = setup(t),
    access = createRubySterileAccess(
      f.configuration,
      f.directory,
      f.identities,
    ),
    token = f.token({ role: "reviewer" });
  assert.equal(await access.authenticate(token), null);
  f.save();
  assert.ok(await access.authenticate(token));
  f.save(
    {
      ...f.user,
      facilities: [
        {
          facilityId: f.facilityId,
          capabilityEnabled: true,
          permissions: ["instruments:read"],
        },
      ],
    },
    1,
  );
  assert.equal(
    await access.authorize(f.scope, "sterile.core", "instruments:write"),
    false,
  );
  assert.equal(
    await access.authorize(f.scope, "sterile.core", "instruments:read"),
    true,
  );
  f.save(
    {
      ...f.user,
      facilities: [{ ...f.user.facilities[0], capabilityEnabled: false }],
    },
    2,
  );
  assert.equal(await access.authenticate(token), null);
  assert.equal(
    await access.authorize(f.scope, "sterile.core", "instruments:read"),
    false,
  );
  f.save({ ...f.user, status: "DISABLED" }, 3);
  assert.equal(await access.authenticate(token), null);
  assert.equal(
    await access.authorize(f.scope, "sterile.core", "instruments:read"),
    false,
  );
});
test("access records and attributed change history persist; stale writes and failed audit insert roll back", async (t) => {
  const f = setup(t);
  f.save();
  f.save({ ...f.user, status: "DISABLED" }, 1);
  assert.throws(() => f.save(f.user, 1), /conflict/);
  f.reopen();
  assert.equal(
    (await f.directory.findUser(f.configuration.tenantId, f.actorId)).status,
    "DISABLED",
  );
  assert.equal(await f.directory.findUser(randomUUID(), f.actorId), null);
  const db = new DatabaseSync(f.file);
  try {
    const history = db
      .prepare("SELECT * FROM sterile_access_changes ORDER BY version")
      .all();
    assert.equal(history.length, 2);
    assert.ok(history.every((x) => x.changed_by === f.changes.changedBy));
    assert.equal(JSON.parse(history[0].payload).status, "ACTIVE");
    assert.equal(JSON.parse(history[1].payload).status, "DISABLED");
    db.exec(
      "CREATE TRIGGER fail_access_audit BEFORE INSERT ON sterile_access_changes BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END;",
    );
    assert.throws(() => f.save(f.user, 2), /simulated audit failure/);
    assert.equal(
      (await f.directory.findUser(f.configuration.tenantId, f.actorId)).version,
      2,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM sterile_access_changes").get().n,
      2,
    );
  } finally {
    db.close();
  }
});
test("separate connections see revocation and reject competing same-version grants", async (t) => {
  const f = setup(t);
  f.save();
  const second = new SqliteSterileAccessDirectory(f.file);
  try {
    const access = createRubySterileAccess(
      f.configuration,
      second,
      f.identities,
    );
    assert.ok(await access.authenticate(f.token()));
    f.save({ ...f.user, status: "DISABLED" }, 1);
    assert.equal(await access.authenticate(f.token()), null);
    assert.throws(
      () => second.replaceAccess(f.user, { ...f.changes, expectedVersion: 1 }),
      /conflict/,
    );
  } finally {
    second.close();
  }
});
test("HTTP composed service enforces bearer identity, granular writes, spoof denial, attribution and live revocation", async (t) => {
  const f = setup(t);
  f.save();
  const repository = new MemoryRepository();
  const app = createRubyAuthenticatedSterileApp({
    repository,
    authentication: f.configuration,
    identities: f.identities,
    directory: f.directory,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = "http://127.0.0.1:" + server.address().port,
    base = "/api/v1/sterile/facilities/" + f.facilityId;
  const token = f.token(),
    body = {
      requestId: randomUUID(),
      code: "REAL-AUTH-TEST",
      name: "Fictional test",
      manufacturer: "",
      model: "",
    };
  const call = (path, body, headers = {}) =>
    fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: "Bearer " + token,
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await call(base + "/instrument-types", body)).status, 201);
  assert.equal(repository.state.audit[0].actorId, f.actorId);
  assert.equal(repository.state.audit[0].tenantId, f.configuration.tenantId);
  assert.equal(
    (
      await call(base + "/instrument-types", {
        ...body,
        requestId: randomUUID(),
        actorId: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(base + "/instruments", undefined, {
        cookie: "session=not-an-api-credential",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await call(base + "/instruments", undefined, {
        authorization: "Bearer " + f.token({ tenantId: randomUUID() }),
      })
    ).status,
    401,
  );
  assert.equal(
    (await call("/api/v1/sterile/facilities/" + randomUUID() + "/instruments"))
      .status,
    404,
  );
  f.save(
    {
      ...f.user,
      facilities: [
        { ...f.user.facilities[0], permissions: ["instruments:read"] },
      ],
    },
    1,
  );
  assert.equal(
    (
      await call(base + "/instrument-types", {
        ...body,
        requestId: randomUUID(),
        code: "DENIED",
      })
    ).status,
    403,
  );
  assert.equal((await call(base + "/instruments")).status, 200);
  f.save({ ...f.user, status: "DISABLED" }, 2);
  assert.equal((await call(base + "/instruments")).status, 401);
  assert.equal(repository.state.audit.length, 1);
  assert.equal((await fetch(origin + "/preview/session")).status, 404);
  assert.equal(
    (await (await fetch(origin + "/health")).json()).clinicalUseEnabled,
    false,
  );
});
test("directory outage fails closed as 503 without leaking backend detail or writing records", async (t) => {
  const f = setup(t),
    repository = new MemoryRepository();
  const app = createRubyAuthenticatedSterileApp({
    repository,
    authentication: f.configuration,
    identities: f.identities,
    directory: {
      findUser: async () => {
        throw new Error("private backend failure");
      },
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const res = await fetch(
    "http://127.0.0.1:" +
      server.address().port +
      "/api/v1/sterile/facilities/" +
      f.facilityId +
      "/instruments",
    { headers: { authorization: "Bearer " + f.token() } },
  );
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "SERVICE_UNAVAILABLE" });
  assert.equal(repository.state.audit.length, 0);
});
test("revocation or directory failure between authentication and authorization cannot admit a write", async (t) => {
  const f = setup(t);
  f.save();
  const repository = new MemoryRepository();
  let fail = false,
    reads = 0;
  const directory = {
    findUser: async (...args) => {
      reads++;
      if (reads % 2 === 0) {
        if (fail) throw new Error("private directory outage");
        return { ...f.user, version: 1, status: "DISABLED" };
      }
      return f.directory.findUser(...args);
    },
  };
  const server = createRubyAuthenticatedSterileApp({
    repository,
    authentication: f.configuration,
    identities: f.identities,
    directory,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/v1/sterile/facilities/" +
    f.facilityId +
    "/instrument-types";
  const post = () =>
    fetch(url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + f.token(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        code: "DENIED",
        name: "Denied",
        manufacturer: "",
        model: "",
      }),
    });
  assert.equal((await post()).status, 403);
  fail = true;
  const unavailable = await post();
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "SERVICE_UNAVAILABLE" });
  assert.equal(repository.state.audit.length, 0);
});
test("a grant in another tenant or facility cannot authorize this identity's request", async (t) => {
  const f = setup(t);
  f.save({ ...f.user, tenantId: randomUUID() });
  const access = createRubySterileAccess(
    f.configuration,
    f.directory,
    f.identities,
  );
  assert.equal(await access.authenticate(f.token()), null);
  f.save({
    ...f.user,
    facilities: [
      {
        facilityId: randomUUID(),
        capabilityEnabled: true,
        permissions: ["instruments:write"],
      },
    ],
  });
  assert.equal(
    await access.authorize(f.scope, "sterile.core", "instruments:write"),
    false,
  );
});
test("configuration cannot enable weak secrets or mutable trust settings; invalid access changes are rejected", async (t) => {
  const f = setup(t);
  f.save();
  for (const patch of [
    { secret: "" },
    { secret: "short" },
    { issuer: "" },
    { audience: " " },
    { tenantId: "bad" },
    { maxLifetimeSeconds: 0 },
    { maxLifetimeSeconds: 86401 },
    { maxLifetimeSeconds: 1.5 },
  ])
    assert.throws(() =>
      createRubySterileAccess(
        { ...f.configuration, ...patch },
        f.directory,
        f.identities,
      ),
    );
  const config = { ...f.configuration },
    access = createRubySterileAccess(config, f.directory, f.identities);
  config.secret = "changed";
  config.tenantId = randomUUID();
  assert.ok(await access.authenticate(f.token()));
  for (const patch of [
    { status: "ADMIN" },
    { facilities: [...f.user.facilities, ...f.user.facilities] },
    { facilities: [{ ...f.user.facilities[0], capabilityEnabled: "true" }] },
    { facilities: [{ ...f.user.facilities[0], permissions: ["*"] }] },
  ])
    assert.throws(() => f.save({ ...f.user, ...patch }, 1));
  assert.equal(
    (await f.directory.findUser(f.configuration.tenantId, f.actorId)).version,
    1,
  );
});
test(
  "access-store files must be private and cannot use symlink paths",
  { skip: process.platform === "win32" },
  async (t) => {
    const f = setup(t),
      publicDir = join(f.dir, "public");
    mkdirSync(publicDir);
    chmodSync(publicDir, 0o755);
    assert.throws(
      () => new SqliteSterileAccessDirectory(join(publicDir, "access.sqlite")),
      /private/,
    );
    const link = join(f.dir, "link");
    symlinkSync(f.file, link);
    assert.throws(() => new SqliteSterileAccessDirectory(link), /private/);
  },
);

test("current Ruby account status is mandatory and overrides a valid token and active local grant", async (t) => {
  const f = setup(t);
  f.save();
  let identity = await f.identities.findById(
    f.actorId,
    f.configuration.tenantId,
  );
  const identities = { findById: async () => identity };
  const access = createRubySterileAccess(
      f.configuration,
      f.directory,
      identities,
    ),
    token = f.token();
  assert.ok(await access.authenticate(token));
  for (const patch of [
    { status: "DISABLED" },
    { status: "SUSPENDED" },
    { status: "PENDING" },
    { type: "SERVICE" },
    { tenantId: randomUUID() },
    { id: randomUUID() },
  ]) {
    identity = {
      id: f.actorId,
      tenantId: f.configuration.tenantId,
      type: "USER",
      status: "ACTIVE",
      ...patch,
    };
    assert.equal(await access.authenticate(token), null);
    assert.equal(
      await access.authorize(f.scope, "sterile.core", "instruments:read"),
      false,
    );
  }
  identity = null;
  assert.equal(await access.authenticate(token), null);
  assert.throws(
    () => createRubySterileAccess(f.configuration, f.directory),
    /configuration/,
  );
});
test("Ruby identity repository failure is not mistaken for a missing account", async (t) => {
  const f = setup(t);
  f.save();
  const access = createRubySterileAccess(f.configuration, f.directory, {
    findById: async () => {
      throw new Error("identity unavailable");
    },
  });
  await assert.rejects(
    () => access.authenticate(f.token()),
    /identity unavailable/,
  );
  await assert.rejects(
    () => access.authorize(f.scope, "sterile.core", "instruments:read"),
    /identity unavailable/,
  );
});
