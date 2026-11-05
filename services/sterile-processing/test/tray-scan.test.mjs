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
test("tray scan HTTP enforces operator, CSRF, strict body and duplicate handling", async (t) => {
  const f = await httpFixture(t),
    requestId = randomUUID();
  await f.login("reviewer");
  assert.equal(
    (await f.call("/preview/tray-scan-example", { requestId })).status,
    403,
  );
  await f.login("operator");
  const sampleResponse = await f.call("/preview/tray-scan-example", {
    requestId,
  });
  assert.equal(sampleResponse.status, 201);
  const sample = await sampleResponse.json();
  assert.equal(sample.assembly.instruments.length, 0);
  assert.equal(sample.instrument.processingHold, undefined);
  const path = f.base + "/tray-assemblies/" + sample.assembly.id + "/scan",
    input = {
      requestId: randomUUID(),
      version: 1,
      identifier: sample.instrument.scanIdentifier,
      confirmed: true,
    };
  assert.equal(
    (await f.call(path, { ...input, actorId: randomUUID() })).status,
    400,
  );
  assert.equal(
    (await f.call(path, input, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  assert.equal(
    (await f.call(path, { ...input, confirmed: false })).status,
    400,
  );
  await f.login("viewer");
  assert.equal((await f.call(path, input)).status, 403);
  await f.login("reviewer");
  assert.equal((await f.call(path, input)).status, 403);
  await f.login("operator");
  const response = await f.call(path, input);
  assert.equal(response.status, 200);
  const a = await response.json();
  assert.equal(a.instruments.length, 1);
  assert.equal(a.state, "draft");
  assert.deepEqual(await (await f.call(path, input)).json(), a);
  const duplicate = await f.call(path, {
    ...input,
    requestId: randomUUID(),
    version: 2,
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "SCAN_DUPLICATE");
  const view = await (await f.call(f.base + "/tray-assemblies/" + a.id)).json();
  assert.equal(view.assessment.assigned, 1);
  assert.equal(view.assessment.missing, 0);
  const history = await (
    await f.call(f.base + "/tray-assemblies/" + a.id + "/history")
  ).json();
  assert.equal(
    history.items.filter((x) => x.action === "tray-instrument-added-by-scan")
      .length,
    1,
  );
});
test("SQLite competing scan additions reserve once, persist on reopen and rollback on audit failure", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-trayscan-")),
    file = join(dir, "preview.sqlite");
  let repo = new PreviewSqliteRepository(file);
  const other = new PreviewSqliteRepository(file);
  t.after(() => {
    other.close();
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const s = {
    tenantId: randomUUID(),
    facilityId: randomUUID(),
    actorId: randomUUID(),
  };
  const { prepareTrayScanExample } =
    await import("../dist/development/tray-scan-example.js");
  const sample = await prepareTrayScanExample(repo, s, randomUUID()),
    tr = new TrayRegistry(repo),
    a2 = await tr.createAssembly(s, {
      requestId: randomUUID(),
      code: "OTHER",
      definitionId: sample.assembly.definitionId,
      definitionVersion: 1,
    });
  const input = () => ({
    requestId: randomUUID(),
    version: 1,
    identifier: sample.instrument.scanIdentifier,
    confirmed: true,
  });
  const broken = {
    transaction: (scope, work) =>
      repo.transaction(scope, (tx) =>
        work({
          ...tx,
          appendAudit: async () => {
            throw Error("audit unavailable");
          },
        }),
      ),
  };
  await assert.rejects(
    new TrayRegistry(broken).addByScan(s, sample.assembly.id, input()),
    /audit unavailable/,
  );
  assert.equal((await tr.assembly(s, sample.assembly.id)).assembly.version, 1);
  assert.equal(
    (await new InstrumentRegistry(repo).get(s, sample.instrument.id))
      .activeAssembly,
    undefined,
  );
  const results = await Promise.allSettled([
    tr.addByScan(s, sample.assembly.id, input()),
    new TrayRegistry(other).addByScan(s, a2.id, input()),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const winner = results.find((x) => x.status === "fulfilled").value;
  repo.close();
  repo = new PreviewSqliteRepository(file);
  assert.equal(
    (await new TrayRegistry(repo).assembly(s, winner.id)).assembly.instruments
      .length,
    1,
  );
  assert.equal(
    (await new InstrumentRegistry(repo).get(s, sample.instrument.id))
      .activeAssembly.assemblyId,
    winner.id,
  );
});
