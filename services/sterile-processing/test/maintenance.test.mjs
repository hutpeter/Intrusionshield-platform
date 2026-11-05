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
  MaintenanceRegistry,
  TrayRegistry,
  PackagingRegistry,
  CycleRegistry,
  ReviewRegistry,
  DistributionRegistry,
  RecallRegistry,
  ReturnRegistry,
  ProcessingRegistry,
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
const command = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  confirmed: true,
  ...extra,
});
const auth = () =>
  command(4, {
    reason: "SIMULATED reviewed repair",
    evidence: "SIMULATED-FUNCTION",
    procedure: "SIMULATED-PROCESS",
    procedureVersion: "1",
    code: "MAINT-REC",
    custodian: "Receiver",
    location: "Quarantine",
    functionalChecked: true,
  });
test("maintenance HTTP role separation, strict input, CSRF and fresh receiving", async (t) => {
  const f = await httpFixture(t),
    path = f.base + "/instruments/" + f.i.id + "/maintenance/";
  const report = command(1, { defect: "Broken hinge", location: "Quarantine" });
  assert.equal(
    (await f.call(path + "report", { ...report, actorId: randomUUID() }))
      .status,
    400,
  );
  assert.equal(
    (await f.call(path + "report", report, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  assert.equal((await f.call(path + "report?unknown=x", report)).status, 400);
  assert.equal((await f.call(path + "report", report)).status, 200);
  assert.equal((await f.call(path + "report", report)).status, 200);
  assert.equal(
    (
      await f.call(
        path + "assess",
        command(2, { note: "Needs repair", evidence: "ASSESS" }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await f.call(
        path + "repair",
        command(3, {
          note: "Repaired",
          provider: "Service",
          evidence: "SERVICE",
        }),
      )
    ).status,
    200,
  );
  const authorization = auth();
  assert.equal((await f.call(path + "authorize", authorization)).status, 403);
  await f.login("viewer");
  assert.equal((await f.call(path + "authorize", authorization)).status, 403);
  await f.login("reviewer");
  assert.equal(
    (
      await f.call(
        path + "repair",
        command(4, { note: "bypass", provider: "Service", evidence: "x" }),
      )
    ).status,
    403,
  );
  const response = await f.call(path + "authorize", authorization);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.state, "registered");
  const current = await (
    await f.call(f.base + "/instruments/" + f.i.id)
  ).json();
  assert.ok(current.processingHold);
  const e = await (
    await f.call(f.base + "/processing/" + current.processingHold.episodeId)
  ).json();
  assert.equal(e.state, "received");
  assert.deepEqual(e.attempts, []);
  assert.deepEqual(e.inspections, []);
  assert.equal((await f.call(path + "authorize", auth())).status, 409);
});
test("fictional maintenance helper is explicit, scoped, idempotent and operator only", async (t) => {
  const f = await httpFixture(t),
    input = { requestId: randomUUID() };
  await f.login("reviewer");
  assert.equal(
    (await f.call("/preview/maintenance-example", input)).status,
    403,
  );
  await f.login("operator");
  const r = await f.call("/preview/maintenance-example", input);
  assert.equal(r.status, 201);
  const i = await r.json();
  assert.match(i.code, /^MAINT-DEMO-/);
  assert.equal(i.maintenance, undefined);
  const repeat = await (
    await f.call("/preview/maintenance-example", input)
  ).json();
  assert.deepEqual(repeat, i);
});
test("SQLite maintenance evidence persists; late audit failure rolls back fresh receiving atomically", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-maint-")),
    file = join(dir, "preview.sqlite");
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
    ir = new InstrumentRegistry(repo),
    m = new MaintenanceRegistry(repo);
  const type = await ir.createType(s, {
    requestId: randomUUID(),
    code: "CLAMP",
    name: "Clamp",
    manufacturer: "",
    model: "",
  });
  const i = await ir.register(s, {
    requestId: randomUUID(),
    code: "MAINT-1",
    instrumentTypeId: type.id,
    serialNumber: "",
  });
  await m.report(
    s,
    i.id,
    command(1, { defect: "Damage", location: "Quarantine" }),
  );
  await m.assess(s, i.id, command(2, { note: "Repair", evidence: "ASSESS" }));
  await m.repair(
    s,
    i.id,
    command(3, { note: "Repaired", evidence: "SERVICE", provider: "Service" }),
  );
  const broken = {
    transaction: (scope, work) =>
      repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async (e) => {
            if (e.action === "maintenance-authorized")
              throw Error("late audit failure");
            return tx.appendAudit(e);
          },
        }),
      ),
  };
  await assert.rejects(
    new MaintenanceRegistry(broken).authorizeReturn(s, i.id, auth()),
    /late audit failure/,
  );
  assert.equal((await ir.get(s, i.id)).state, "maintenance");
  assert.equal((await new ProcessingRegistry(repo).list(s)).items.length, 0);
  const result = await m.authorizeReturn(s, i.id, auth());
  repo.close();
  repo = new PreviewSqliteRepository(file);
  const current = await new InstrumentRegistry(repo).get(s, i.id);
  assert.equal(
    current.maintenance[0].authorization.episodeId,
    result.maintenance[0].authorization.episodeId,
  );
  assert.ok(current.processingHold);
});
