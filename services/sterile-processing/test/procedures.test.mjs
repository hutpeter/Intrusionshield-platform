import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  InstrumentRegistry,
  ProcessingRegistry,
  ProcedureRegistry,
} from "@intrusionshield/sterile-processing";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
import { createSterilePreview } from "../dist/development/preview.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
async function httpFixture(t) {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = "http://127.0.0.1:" + server.address().port;
  const dir = mkdtempSync(join(tmpdir(), "sterile-trays-http-")),
    repo = new PreviewSqliteRepository(join(dir, "registry.sqlite")),
    preview = createSterilePreview({ origin, repository: repo });
  server.on("request", preview.app);
  t.after(
    () =>
      new Promise((resolve) =>
        server.close(() => {
          preview.dispose();
          repo.close();
          rmSync(dir, { recursive: true, force: true });
          resolve();
        }),
      ),
  );
  let cookie = "",
    session;
  async function call(path, body, headers = {}) {
    const r = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(cookie ? { cookie } : {}),
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
  async function login(role = "operator") {
    session = await (await call("/preview/session")).json();
    session = await (await call("/preview/login", { role })).json();
    return session;
  }
  const s = await login(),
    base = "/api/v1/sterile/facilities/" + s.facilityId;
  const type = await (
    await call(base + "/instrument-types", {
      requestId: randomUUID(),
      code: "CLAMP",
      name: "Pinza",
      manufacturer: "",
      model: "",
    })
  ).json();
  const i = await (
    await call(base + "/instruments", {
      requestId: randomUUID(),
      instrumentTypeId: type.id,
      code: "INS-001",
      serialNumber: "",
    })
  ).json();
  return {
    call,
    login,
    base,
    type,
    i,
    get session() {
      return session;
    },
  };
}
const draft = (typeId) => ({
  requestId: randomUUID(),
  code: "CONTROLLED-CLEAN",
  title: "Fictional procedure",
  stage: "cleaning",
  method: "manual",
  instructions: "FICTIONAL ONLY\nNo clinical instructions",
  source: "DEMO-SOURCE",
  instrumentTypeIds: [typeId],
  confirmed: true,
});
const decision = (version) => ({
  requestId: randomUUID(),
  version,
  reason: "SIMULATED reviewer decision",
  confirmed: true,
});
test("procedure publication is reviewer-only, scoped/CSRF protected, and controlled cleaning retains the saved revision after withdrawal", async (t) => {
  const f = await httpFixture(t),
    dres = await f.call(f.base + "/procedures", draft(f.type.id));
  assert.equal(dres.status, 201);
  const d = await dres.json();
  assert.equal(
    (await f.call(f.base + "/procedures/" + d.id + "/publish", decision(1)))
      .status,
    403,
  );
  await f.login("viewer");
  assert.equal(
    (await f.call(f.base + "/procedures", draft(f.type.id))).status,
    403,
  );
  await f.login("reviewer");
  assert.equal(
    (
      await f.call(f.base + "/procedures/" + d.id + "/publish", decision(1), {
        "x-sterile-csrf": "bad",
      })
    ).status,
    403,
  );
  const pub = await (
    await f.call(f.base + "/procedures/" + d.id + "/publish", decision(1))
  ).json();
  assert.equal(pub.state, "published");
  assert.equal(
    (await (await f.call(f.base + "/procedures/available/cleaning")).json())
      .items[0].id,
    pub.id,
  );
  await f.login("operator");
  const e = await (
    await f.call(f.base + "/processing", {
      requestId: randomUUID(),
      code: "REC-CONTROLLED",
      source: "Demo",
      custodian: "Demo",
      condition: "Used",
      discrepancies: "",
      instrumentIds: [f.i.id],
      confirmed: true,
    })
  ).json();
  const b = {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: pub.code,
    procedureVersion: String(pub.revision),
    procedureRevisionId: pub.id,
    equipment: "",
    confirmed: true,
  };
  assert.equal(
    (
      await f.call(f.base + "/processing/" + e.id + "/start", {
        ...b,
        controlledProcedure: pub,
      })
    ).status,
    400,
  );
  const started = await f.call(f.base + "/processing/" + e.id + "/start", b);
  assert.equal(started.status, 200);
  assert.equal(
    (await started.json()).attempts[0].controlledProcedure.instructions,
    pub.instructions,
  );
  await f.login("reviewer");
  assert.equal(
    (await f.call(f.base + "/procedures/" + pub.id + "/withdraw", decision(2)))
      .status,
    200,
  );
  assert.equal(
    (await (await f.call(f.base + "/procedures/available/cleaning")).json())
      .items.length,
    0,
  );
  assert.equal(
    (await (await f.call(f.base + "/processing/" + e.id)).json()).attempts[0]
      .controlledProcedure.state,
    "published",
  );
  assert.equal(
    (
      await (
        await f.call(f.base + "/procedures/" + pub.id + "/versions/2")
      ).json()
    ).state,
    "published",
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/procedures/" +
          pub.id,
      )
    ).status,
    404,
  );
});
test("SQLite draft/publication status and saved content survive reopening with atomic audit rollback", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-procedure-")),
    file = join(dir, "registry.sqlite");
  let repo = new PreviewSqliteRepository(file);
  t.after(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    type = await new InstrumentRegistry(repo).createType(s, {
      requestId: randomUUID(),
      code: "TYPE",
      name: "Demo",
      manufacturer: "",
      model: "",
    }),
    d = await new ProcedureRegistry(repo).draft(s, draft(type.id)),
    broken = {
      transaction: (scope, work) =>
        repo.transaction(scope, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("late audit");
            },
          }),
        ),
    },
    b = decision(1);
  await assert.rejects(
    new ProcedureRegistry(broken).transition(s, d.id, "publish", b),
    /late audit/,
  );
  assert.equal((await new ProcedureRegistry(repo).get(s, d.id)).state, "draft");
  const p = await new ProcedureRegistry(repo).transition(s, d.id, "publish", b);
  repo.close();
  repo = new PreviewSqliteRepository(file);
  assert.deepEqual(await new ProcedureRegistry(repo).get(s, d.id), p);
  assert.deepEqual(
    await new ProcedureRegistry(repo).transition(s, d.id, "publish", b),
    p,
  );
  assert.equal(
    (await new ProcedureRegistry(repo).history(s, d.id)).items.length,
    2,
  );
});
test("controlled source selection requires procedure read permission before accessing workflow data", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    server = createServer();
  let calls = 0;
  server.on(
    "request",
    createSterileApp({
      repository: {
        transaction: async () => {
          calls++;
          throw Error("must not query");
        },
      },
      authenticate: async () => ({
        tenantId: s.tenantId,
        actorId: s.actorId,
        personId: s.actorId,
        facilityIds: [s.facilityId],
      }),
      authorize: async (scope, cap, permission) =>
        permission === "processing:write",
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const r = await fetch(
    "http://127.0.0.1:" +
      server.address().port +
      "/api/v1/sterile/facilities/" +
      s.facilityId +
      "/processing/" +
      randomUUID() +
      "/start",
    {
      method: "POST",
      headers: {
        authorization: "Bearer demo",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        version: 1,
        method: "manual",
        procedure: "CODE",
        procedureVersion: "1",
        procedureRevisionId: randomUUID(),
        equipment: "",
        confirmed: true,
      }),
    },
  );
  assert.equal(r.status, 403);
  assert.equal(calls, 0);
});
