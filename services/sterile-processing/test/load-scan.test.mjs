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
test("package lookup and load scan enforce current label, operator role, CSRF and retry-safe membership", async (t) => {
  const f = await httpFixture(t),
    requestId = randomUUID();
  await f.login("reviewer");
  assert.equal(
    (await f.call("/preview/load-scan-example", { requestId })).status,
    403,
  );
  await f.login("operator");
  const setup = await f.call("/preview/load-scan-example", { requestId });
  assert.equal(setup.status, 201);
  const example = await setup.json();
  assert.equal(example.load.state, "draft");
  assert.equal(example.load.packages.length, 1);
  const lookup =
    f.base + "/package-scan?identifier=" + example.package.scanIdentifier;
  await f.login("viewer");
  const read = await f.call(lookup);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).id, example.package.id);
  const path = f.base + "/loads/" + example.load.id + "/scan",
    input = {
      requestId: randomUUID(),
      version: 1,
      identifier: example.package.scanIdentifier,
      confirmed: true,
    };
  assert.equal((await f.call(path, input)).status, 403);
  await f.login("reviewer");
  assert.equal((await f.call(path, input)).status, 403);
  await f.login("operator");
  assert.equal(
    (await f.call(path, input, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  assert.equal(
    (await f.call(path, { ...input, actorId: randomUUID() })).status,
    400,
  );
  assert.equal(
    (await f.call(path, { ...input, confirmed: false })).status,
    400,
  );
  const r = await f.call(path, input);
  assert.equal(r.status, 200);
  const load = await r.json();
  assert.equal(
    load.packages.filter((p) => p.id === example.package.id).length,
    1,
  );
  assert.equal(load.state, "draft");
  assert.deepEqual(await (await f.call(path, input)).json(), load);
  const duplicate = await f.call(path, {
    ...input,
    requestId: randomUUID(),
    version: 2,
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, "SCAN_DUPLICATE");
  assert.equal((await f.call(lookup + "&unknown=x")).status, 400);
});
test("SQLite scanned load reservations persist; races and late audit failures preserve whole history", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-loadscan-")),
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
    },
    { prepareLoadScanExample } =
      await import("../dist/development/load-scan-example.js"),
    example = await prepareLoadScanExample(repo, s, randomUUID()),
    second = await prepareLoadScanExample(repo, s, randomUUID()),
    input = () => ({
      requestId: randomUUID(),
      version: 1,
      identifier: example.package.scanIdentifier,
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
    new CycleRegistry(broken).addByScan(s, example.load.id, input()),
    /audit unavailable/,
  );
  assert.equal(
    (await new CycleRegistry(repo).get(s, example.load.id)).packages.length,
    1,
  );
  assert.equal(
    (await new PackagingRegistry(repo).get(s, example.package.id)).activeLoad,
    undefined,
  );
  const results = await Promise.allSettled([
    new CycleRegistry(repo).addByScan(s, example.load.id, input()),
    new CycleRegistry(other).addByScan(s, second.load.id, input()),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const winner = results.find((x) => x.status === "fulfilled").value;
  repo.close();
  repo = new PreviewSqliteRepository(file);
  assert.equal(
    (await new PackagingRegistry(repo).get(s, example.package.id)).activeLoad
      .loadId,
    winner.id,
  );
  assert.equal(
    (await new CycleRegistry(repo).get(s, winner.id)).packages.filter(
      (p) => p.id === example.package.id,
    ).length,
    1,
  );
});
