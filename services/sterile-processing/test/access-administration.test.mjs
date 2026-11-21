import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import { DatabaseSync } from "node:sqlite";
import { createSterileBrowserApp } from "../dist/security/browser.js";
import { SqliteSterileAccessDirectory } from "../dist/security/sqlite-access.js";
import { MemoryRepository } from "../../../packages/sterile-processing/test/memory-repository.mjs";
async function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), "sterile-admin-")),
    file = join(folder, "access.sqlite"),
    directory = new SqliteSterileAccessDirectory(file);
  const tenantId = randomUUID(),
    facilityId = randomUUID(),
    otherFacility = randomUUID(),
    admin = randomUUID(),
    operator = randomUUID(),
    alias = randomUUID(),
    foreign = randomUUID(),
    person = randomUUID(),
    secret = randomBytes(48).toString("hex");
  const identities = new Map(
    [admin, operator, alias, foreign].map((id) => [
      id,
      {
        id,
        tenantId,
        type: "USER",
        status: "ACTIVE",
        displayName: "Name " + id,
      },
    ]),
  );
  function seed(
    id,
    permissions,
    personId = id,
    facilities = [{ facilityId, capabilityEnabled: true, permissions }],
  ) {
    return directory.replaceAccess(
      { tenantId, actorId: id, personId, status: "ACTIVE", facilities },
      { changedBy: admin, expectedVersion: 0, reason: "Initial enrollment" },
    );
  }
  seed(admin, ["access:manage", "instruments:read"], person);
  seed(alias, ["instruments:read"], person);
  seed(operator, ["instruments:read", "instruments:write"], operator, [
    {
      facilityId,
      capabilityEnabled: true,
      permissions: ["instruments:read", "instruments:write"],
    },
    {
      facilityId: otherFacility,
      capabilityEnabled: true,
      permissions: ["release:read"],
    },
  ]);
  seed(foreign, ["instruments:read"], foreign, [
    {
      facilityId: otherFacility,
      capabilityEnabled: true,
      permissions: ["instruments:read"],
    },
  ]);
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const host = "127.0.0.1:" + server.address().port,
    origin = "https://" + host;
  const bff = createSterileBrowserApp({
    origin,
    facilityId,
    facilityName: "Fictional facility",
    timeZone: "UTC",
    repository: new MemoryRepository(),
    directory,
    administration: directory,
    identities: { findById: async (id) => identities.get(id) ?? null },
    authentication: {
      tenantId,
      issuer: "ruby",
      audience: "sterile",
      secret,
      maxLifetimeSeconds: 3600,
    },
    signIn: async ({ username }) =>
      identities.has(username)
        ? {
            accessToken: jwt.sign({ tenantId, identityType: "USER" }, secret, {
              issuer: "ruby",
              audience: "sterile",
              subject: username,
              expiresIn: 3600,
            }),
          }
        : null,
  });
  server.on("request", bff.app);
  t.after(async () => {
    await new Promise((r) => server.close(r));
    bff.dispose();
    directory.close();
    rmSync(folder, { recursive: true, force: true });
  });
  async function login(id) {
    let cookie = "",
      csrf = "";
    async function call(path, body, headers = {}) {
      const r = await fetch("http://" + host + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body === undefined
            ? {}
            : {
                origin,
                "content-type": "application/json",
                "x-sterile-csrf": csrf,
              }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (r.headers.has("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      const value = await r.json();
      if (value.csrf) csrf = value.csrf;
      return { status: r.status, body: value };
    }
    await call("/auth/session");
    const result = await call("/auth/login", {
      username: id,
      password: "fictional",
    });
    assert.equal(result.status, 200);
    return call;
  }
  const root = "/api/v1/sterile/access/users";
  const change = async (patch = {}) => ({
    expectedVersion: (await directory.findUser(tenantId, operator)).version,
    capabilityEnabled: true,
    permissions: ["instruments:read"],
    reason: "Remove recording permission",
    confirmed: true,
    ...patch,
  });
  return {
    tenantId,
    facilityId,
    otherFacility,
    admin,
    operator,
    alias,
    foreign,
    directory,
    identities,
    login,
    root,
    change,
    file,
  };
}
test("only explicit administrators can list current-facility enrollments or save changes; other facilities and person maps survive", async (t) => {
  const f = await fixture(t),
    admin = await f.login(f.admin),
    operator = await f.login(f.operator);
  assert.equal((await operator(f.root)).status, 403);
  assert.equal(
    (await operator(f.root + "/" + f.operator, await f.change())).status,
    403,
  );
  const result = await admin(f.root);
  assert.equal(result.status, 200);
  assert.equal(result.body.users.length, 3);
  assert.equal(
    result.body.users.some((u) => u.actorId === f.foreign),
    false,
  );
  assert.equal(JSON.stringify(result.body).includes(f.otherFacility), false);
  assert.equal(result.body.users.find((u) => u.actorId === f.admin).self, true);
  assert.equal(result.body.users.find((u) => u.actorId === f.alias).self, true);
  assert.equal(
    (await admin(f.root + "/" + f.operator, await f.change())).status,
    200,
  );
  const saved = await f.directory.findUser(f.tenantId, f.operator);
  assert.equal(saved.personId, f.operator);
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.facilities[1], {
    facilityId: f.otherFacility,
    capabilityEnabled: true,
    permissions: ["release:read"],
  });
  assert.equal(
    (
      await operator(
        "/api/v1/sterile/facilities/" + f.facilityId + "/instruments",
        {},
      )
    ).status,
    403,
  );
});
test("requires CSRF and exact server-scoped fields, rejects self and alias changes and hides foreign enrollment", async (t) => {
  const f = await fixture(t),
    admin = await f.login(f.admin),
    input = await f.change();
  assert.equal(
    (
      await admin(f.root + "/" + f.operator, input, {
        "x-sterile-csrf": "wrong",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await admin(f.root + "/" + f.operator, input, {
        origin: "https://foreign.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await admin(f.root + "/" + f.operator, { ...input, tenantId: f.tenantId }))
      .status,
    400,
  );
  assert.equal(
    (
      await admin(f.root + "/" + f.operator, {
        ...input,
        personId: randomUUID(),
      })
    ).status,
    400,
  );
  assert.equal(
    (await admin(f.root + "/" + f.operator, { ...input, permissions: ["*"] }))
      .status,
    400,
  );
  assert.equal(
    (
      await admin(f.root + "/" + f.operator, {
        ...input,
        permissions: ["instruments:read", "instruments:read"],
      })
    ).status,
    400,
  );
  assert.equal(
    (await admin(f.root + "/" + f.operator, { ...input, confirmed: false }))
      .status,
    400,
  );
  assert.equal(
    (await admin(f.root + "/" + f.admin, { ...input, expectedVersion: 1 }))
      .status,
    403,
  );
  assert.equal(
    (await admin(f.root + "/" + f.alias, { ...input, expectedVersion: 1 }))
      .status,
    403,
  );
  assert.equal(
    (await admin(f.root + "/" + f.foreign, { ...input, expectedVersion: 1 }))
      .status,
    404,
  );
  assert.equal(
    (await admin(f.root + "/" + f.foreign + "/history")).status,
    404,
  );
  assert.equal((await admin(f.root + "?tenantId=" + f.tenantId)).status, 400);
});
test("uses versions for competing writes and applies facility disablement to existing sessions", async (t) => {
  const f = await fixture(t),
    admin = await f.login(f.admin),
    operator = await f.login(f.operator),
    input = await f.change();
  const results = await Promise.all([
    admin(f.root + "/" + f.operator, input),
    admin(f.root + "/" + f.operator, {
      ...input,
      reason: "Concurrent other change",
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await admin(f.root + "/" + f.operator, input)).status, 409);
  assert.equal(
    (
      await admin(
        f.root + "/" + f.operator,
        await f.change({ capabilityEnabled: false }),
      )
    ).status,
    200,
  );
  assert.equal((await operator("/auth/session")).body.authenticated, false);
  assert.equal((await operator(f.root)).status, 401);
});
test("rechecks administration authority in the write transaction and on each browser request", async (t) => {
  const f = await fixture(t),
    admin = await f.login(f.admin),
    user = await f.directory.findUser(f.tenantId, f.admin);
  assert.equal((await admin("/auth/session")).body.canManageAccess, true);
  f.directory.replaceAccess(
    {
      ...user,
      facilities: [
        {
          facilityId: f.facilityId,
          capabilityEnabled: true,
          permissions: ["instruments:read"],
        },
      ],
    },
    {
      changedBy: f.operator,
      reason: "Revoke administration",
      expectedVersion: user.version,
    },
  );
  assert.equal((await admin("/auth/session")).body.canManageAccess, false);
  assert.equal((await admin(f.root)).status, 403);
  await assert.rejects(
    () =>
      f.directory.replaceFacilityAccess({
        tenantId: f.tenantId,
        facilityId: f.facilityId,
        actorId: f.operator,
        administratorId: f.admin,
        administratorVersion: user.version,
        expectedVersion: 1,
        capabilityEnabled: true,
        permissions: ["access:manage"],
        reason: "Stale authority",
      }),
    (e) => e.code === "FORBIDDEN",
  );
});
test("rejects disabled identities and missing-person records without creating grants", async (t) => {
  const f = await fixture(t),
    admin = await f.login(f.admin);
  f.identities.get(f.operator).status = "DISABLED";
  assert.equal(
    (await admin(f.root + "/" + f.operator, await f.change())).status,
    409,
  );
  assert.equal((await f.directory.findUser(f.tenantId, f.operator)).version, 1);
});
test("rolls back grants and history together and preserves audit on reopening", async (t) => {
  const f = await fixture(t),
    admin = await f.login(f.admin),
    db = new DatabaseSync(f.file);
  t.after(() => db.close());
  db.exec(
    "CREATE TRIGGER deny_access_audit BEFORE INSERT ON sterile_access_changes WHEN NEW.version>1 BEGIN SELECT RAISE(ABORT,'private audit failure'); END;",
  );
  const r = await admin(f.root + "/" + f.operator, await f.change());
  assert.equal(r.status, 503);
  assert.equal(JSON.stringify(r.body).includes("private"), false);
  assert.equal((await f.directory.findUser(f.tenantId, f.operator)).version, 1);
  db.exec("DROP TRIGGER deny_access_audit");
  assert.equal(
    (await admin(f.root + "/" + f.operator, await f.change())).status,
    200,
  );
  const reopened = new SqliteSterileAccessDirectory(f.file);
  try {
    assert.equal((await reopened.findUser(f.tenantId, f.operator)).version, 2);
    const history = reopened.facilityHistory(
      f.tenantId,
      f.operator,
      f.facilityId,
    );
    assert.equal(history[0].reason, "Remove recording permission");
    assert.equal(history[0].changedBy, f.admin);
  } finally {
    reopened.close();
  }
});
test("does not expose other-facility audit reasons in this facility history", async (t) => {
  const f = await fixture(t),
    admin = await f.login(f.admin),
    user = await f.directory.findUser(f.tenantId, f.operator);
  f.directory.replaceAccess(
    {
      ...user,
      facilities: user.facilities.map((g) =>
        g.facilityId === f.otherFacility
          ? { ...g, permissions: ["release:read", "release:write"] }
          : g,
      ),
    },
    {
      changedBy: f.admin,
      expectedVersion: user.version,
      reason: "PRIVATE OTHER FACILITY REASON",
    },
  );
  const history = await admin(f.root + "/" + f.operator + "/history");
  assert.equal(history.status, 200);
  assert.equal(JSON.stringify(history.body).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(history.body).includes(f.otherFacility), false);
});

test("bootstrap preparation is private, additive, versioned and does not apply the grant or overwrite files", async (t) => {
  const f = await fixture(t),
    { mkdirSync, readFileSync, statSync } = await import("node:fs"),
    { dirname } = await import("node:path"),
    { prepareAccessAdministrator } =
      await import("../../../scripts/sterile-access-admin-preparation.mjs");
  mkdirSync(join(dirname(f.file), "secrets"), { mode: 0o700 });
  const before = await f.directory.findUser(f.tenantId, f.operator),
    config = {
      tenantId: f.tenantId,
      facilityId: f.facilityId,
      accessFile: f.file,
    };
  const file = prepareAccessAdministrator(
    config,
    join(dirname(f.file), "account.json"),
    f.operator,
    f.admin,
    "Explicit OS administrator bootstrap",
  );
  const change = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(change.expectedVersion, before.version);
  assert.equal(change.changedBy, f.admin);
  assert.equal(change.personId, before.personId);
  assert.deepEqual(change.facilities[1], before.facilities[1]);
  assert.deepEqual(change.facilities[0].permissions, [
    ...before.facilities[0].permissions,
    "access:manage",
  ]);
  assert.deepEqual(await f.directory.findUser(f.tenantId, f.operator), before);
  if (process.platform !== "win32")
    assert.equal(statSync(file).mode & 0o077, 0);
  assert.throws(() =>
    prepareAccessAdministrator(
      config,
      join(dirname(f.file), "account.json"),
      f.operator,
      f.admin,
      "No overwrite",
    ),
  );
  assert.throws(() =>
    prepareAccessAdministrator(
      config,
      join(dirname(f.file), "account.json"),
      f.foreign,
      f.admin,
      "Wrong facility",
    ),
  );
});
