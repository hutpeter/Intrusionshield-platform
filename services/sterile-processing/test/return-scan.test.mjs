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
const scannedReturn = (scan, extra = {}) => ({
  requestId: randomUUID(),
  code: "RETSCAN-1",
  distributionId: scan.issue.id,
  distributionVersion: scan.issue.version,
  condition: "used",
  location: "DEMO-RETURN-SCAN-QUARANTINE",
  custodian: "DEMO-RETURNER",
  reference: "SIMULATED-RETURN-SCAN",
  note: "Fictional return",
  contentsChecked: true,
  confirmed: true,
  identifier: scan.identifier,
  receivedInstrumentIds: scan.manifest.map((i) => i.id),
  ...extra,
});
test("scan return setup, contents gate and final receipt enforce scope, roles, CSRF and duplicate rules", async (t) => {
  const f = await httpFixture(t),
    key = { requestId: randomUUID() };
  await f.login("reviewer");
  assert.equal((await f.call("/preview/return-scan-example", key)).status, 403);
  await f.login("operator");
  const setup = await f.call("/preview/return-scan-example", key);
  assert.equal(setup.status, 201);
  const scan = await setup.json();
  assert.equal(scan.issue.state, "issued");
  const lookup = f.base + "/returns/scan?identifier=" + scan.identifier;
  await f.login("viewer");
  assert.equal((await f.call(lookup)).status, 200);
  const path = f.base + "/returns/scanned",
    body = scannedReturn(scan);
  assert.equal((await f.call(path, body)).status, 403);
  await f.login("operator");
  assert.equal(
    (await f.call(path, body, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  assert.equal(
    (await f.call(path, { ...body, actorId: randomUUID() })).status,
    400,
  );
  const partial = await f.call(path, { ...body, receivedInstrumentIds: [] });
  assert.equal(partial.status, 409);
  assert.equal((await partial.json()).error, "RETURN_CONTENTS_MISMATCH");
  const r = await f.call(path, body);
  assert.equal(r.status, 201);
  const returned = await r.json();
  assert.equal(returned.state, "returned");
  assert.equal(
    "scanReceipt" in
      (await (await f.call(f.base + "/returns")).json()).items[0],
    false,
  );
  assert.equal(returned.scanReceipt.contents.length, scan.manifest.length);
  assert.deepEqual(await (await f.call(path, body)).json(), returned);
  assert.equal((await f.call(lookup)).status, 409);
});
test("SQLite scanned return evidence persists and late audit failure rolls back current return gate", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-returnscan-")),
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
    reviewer = { ...s, actorId: randomUUID() },
    { prepareReturnScanExample } =
      await import("../dist/development/return-scan-example.js"),
    scan = await prepareReturnScanExample(repo, s, reviewer, randomUUID());
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
    new ReturnRegistry(broken).createScanned(s, scannedReturn(scan)),
    /audit unavailable/,
  );
  assert.equal((await new ReturnRegistry(repo).list(s)).items.length, 0);
  assert.equal(
    (await new ReturnRegistry(repo).scan(s, scan.identifier)).issue.id,
    scan.issue.id,
  );
  const r = await new ReturnRegistry(repo).createScanned(
    s,
    scannedReturn(scan),
  );
  repo.close();
  repo = new PreviewSqliteRepository(file);
  assert.deepEqual(
    (await new ReturnRegistry(repo).get(s, r.id)).scanReceipt,
    r.scanReceipt,
  );
  assert.equal(
    (await new PackagingRegistry(repo).get(s, r.packageId)).returned.id,
    r.id,
  );
});
