import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import jwt from "jsonwebtoken";
import { LocalSqliteSterileRepository } from "../dist/persistence/sqlite.js";
import { SqliteSterileAccessDirectory } from "../dist/security/sqlite-access.js";
import { createRubyAuthenticatedSterileApp } from "../dist/security/access.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_ACCOUNT_ENABLED = "true";
delete process.env.RUBY_STERILE_PREVIEW;
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "sterile-independent-")),
    file = join(dir, "workflow.sqlite"),
    accessFile = join(dir, "access.sqlite");
  let repository = new LocalSqliteSterileRepository(file, "account"),
    directory = new SqliteSterileAccessDirectory(accessFile),
    server;
  const tenantId = randomUUID(),
    facilityId = randomUUID(),
    personId = randomUUID();
  const users = {
    cleaner: {
      actorId: randomUUID(),
      personId,
      permissions: [
        "instruments:read",
        "instruments:write",
        "processing:read",
        "processing:write",
        "processing:inspect",
      ],
    },
    alias: {
      actorId: randomUUID(),
      personId,
      permissions: ["processing:read", "processing:inspect"],
    },
    inspector: {
      actorId: randomUUID(),
      personId: randomUUID(),
      permissions: [
        "instruments:read",
        "processing:read",
        "processing:inspect",
      ],
    },
    reader: {
      actorId: randomUUID(),
      personId: randomUUID(),
      permissions: ["processing:read"],
    },
  };
  for (const user of Object.values(users))
    directory.replaceAccess(
      {
        tenantId,
        actorId: user.actorId,
        personId: user.personId,
        status: "ACTIVE",
        facilities: [
          {
            facilityId,
            capabilityEnabled: true,
            permissions: user.permissions,
          },
        ],
      },
      {
        expectedVersion: 0,
        changedBy: users.cleaner.actorId,
        reason: "Fictional person-verified setup",
      },
    );
  const configuration = {
    tenantId,
    issuer: "ruby-inspection-test",
    audience: "sterile-inspection-test",
    secret: randomBytes(48).toString("hex"),
    maxLifetimeSeconds: 3600,
  };
  const tokens = Object.fromEntries(
    Object.entries(users).map(([name, user]) => [
      name,
      jwt.sign(
        {
          tenantId,
          identityType: "USER",
          roles: ["inspector"],
          personId: randomUUID(),
        },
        configuration.secret,
        {
          algorithm: "HS256",
          issuer: configuration.issuer,
          audience: configuration.audience,
          subject: user.actorId,
          expiresIn: 3600,
        },
      ),
    ]),
  );
  async function boot() {
    const app = createRubyAuthenticatedSterileApp({
      repository,
      directory,
      authentication: configuration,
      identities: {
        findById: async (id, tenant) =>
          tenant === tenantId &&
          Object.values(users).some((x) => x.actorId === id)
            ? { id, tenantId, type: "USER", status: "ACTIVE" }
            : null,
      },
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
  }
  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    repository.close();
    directory.close();
  }
  await boot();
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = "/api/v1/sterile/facilities/" + facilityId;
  async function call(role, path, body, headers = {}) {
    const r = await fetch(
      "http://127.0.0.1:" + server.address().port + base + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: "Bearer " + tokens[role],
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined
          ? {}
          : { body: JSON.stringify({ requestId: randomUUID(), ...body }) }),
      },
    );
    return { status: r.status, body: await r.json() };
  }
  const type = await call("cleaner", "/instrument-types", {
    code: "INDEPENDENT",
    name: "Fictional instrument",
    manufacturer: "",
    model: "",
  });
  assert.equal(type.status, 201);
  const instrument = await call("cleaner", "/instruments", {
    code: "INDEPENDENT-I",
    instrumentTypeId: type.body.id,
    serialNumber: "FICTITIOUS",
  });
  assert.equal(instrument.status, 201);
  let episode = (
    await call("cleaner", "/processing", {
      code: "INDEPENDENT-R",
      source: "Fictional",
      custodian: "Fictional",
      condition: "Fictional used",
      discrepancies: "",
      instrumentIds: [instrument.body.id],
      confirmed: true,
    })
  ).body;
  episode = (
    await call("cleaner", "/processing/" + episode.id + "/start", {
      version: 1,
      method: "manual",
      procedure: "SIMULATED",
      procedureVersion: "1",
      equipment: "",
      confirmed: true,
    })
  ).body;
  episode = (
    await call("cleaner", "/processing/" + episode.id + "/finish", {
      version: 2,
      outcome: "passed",
      evidence: "SIMULATED",
      note: "",
      confirmed: true,
    })
  ).body;
  assert.equal(episode.state, "awaiting_inspection");
  const inspection = {
    version: episode.version,
    procedure: "SIMULATED",
    procedureVersion: "1",
    evidence: "SIMULATED independent check",
    confirmed: true,
    items: [
      {
        instrumentId: instrument.body.id,
        clean: true,
        dry: true,
        intact: true,
        functional: true,
        note: "",
      },
    ],
  };
  return {
    users,
    tenantId,
    facilityId,
    call,
    episode,
    instrument: instrument.body,
    inspection,
    get repository() {
      return repository;
    },
    get directory() {
      return directory;
    },
    async restart() {
      await stop();
      repository = new LocalSqliteSterileRepository(file, "account");
      directory = new SqliteSterileAccessDirectory(accessFile);
      await boot();
    },
  };
}
test("HTTP/SQLite rejects both-role cleaner, alias, missing permission and spoofed person; inspector-only identity can inspect", async (t) => {
  const f = await fixture(t),
    path = "/processing/" + f.episode.id + "/inspect";
  for (const role of ["cleaner", "alias"]) {
    const r = await f.call(role, path, f.inspection, {
      "x-person-id": f.users.inspector.personId,
    });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "SELF_INSPECTION");
  }
  assert.equal((await f.call("reader", path, f.inspection)).status, 403);
  assert.equal(
    (
      await f.call("cleaner", path, {
        ...f.inspection,
        personId: f.users.inspector.personId,
      })
    ).status,
    400,
  );
  const held = (await f.call("cleaner", "/processing/" + f.episode.id)).body;
  assert.equal(held.version, 3);
  assert.equal(held.inspections.length, 0);
  assert.ok(
    (await f.call("cleaner", "/instruments/" + f.instrument.id)).body
      .processingHold,
  );
  const passed = await f.call("inspector", path, f.inspection);
  assert.equal(passed.status, 200);
  assert.equal(passed.body.state, "ready_for_assembly");
  assert.equal(passed.body.inspections[0].personId, f.users.inspector.personId);
  assert.equal(
    passed.body.attempts[0].startedByPersonId,
    f.users.cleaner.personId,
  );
  await f.restart();
  const restored = (await f.call("inspector", "/processing/" + f.episode.id))
    .body;
  assert.equal(restored.inspections[0].personId, f.users.inspector.personId);
  const history = await f.call(
    "inspector",
    "/processing/" + f.episode.id + "/history",
  );
  assert.equal(history.status, 200);
  assert.ok(
    history.body.items.some(
      (event) =>
        event.action === "inspection-recorded" &&
        event.actorId === f.users.inspector.actorId &&
        event.personId === f.users.inspector.personId,
    ),
  );
});
test("account persistence cannot opt into multi-actor fictional batches", async (t) => {
  const f = await fixture(t),
    scope = {
      tenantId: f.tenantId,
      facilityId: f.facilityId,
      actorId: f.users.cleaner.actorId,
      personId: f.users.cleaner.personId,
    };
  await assert.rejects(
    () =>
      f.repository.transactionForActors(scope, async () => null, [
        scope.actorId,
        f.users.inspector.actorId,
      ]),
    (e) => e.code === "INVALID_REQUEST",
  );
});
