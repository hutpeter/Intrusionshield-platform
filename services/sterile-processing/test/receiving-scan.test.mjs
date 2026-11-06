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
const receipt = (i) => ({
  requestId: randomUUID(),
  code: "REC-SCAN",
  source: "Department",
  custodian: "Custodian",
  condition: "Used",
  discrepancies: "",
  instrumentIds: [i.id],
  scannedIdentifiers: [i.scanIdentifier],
  confirmed: true,
});
test("receiving scan setup and confirmed save enforce roles, CSRF, strict bodies and scoped provenance", async (t) => {
  const f = await httpFixture(t),
    requestId = randomUUID();
  await f.login("reviewer");
  assert.equal(
    (await f.call("/preview/receiving-scan-example", { requestId })).status,
    403,
  );
  await f.login("operator");
  const r = await f.call("/preview/receiving-scan-example", { requestId });
  assert.equal(r.status, 201);
  const i = await r.json();
  assert.match(i.code, /^RECSCAN-INS-/);
  assert.equal(i.processingHold, undefined);
  assert.deepEqual(
    await (
      await f.call("/preview/receiving-scan-example", { requestId })
    ).json(),
    i,
  );
  const path = f.base + "/processing/scanned-receipts",
    b = receipt(i);
  assert.equal(
    (await f.call(path, b, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  assert.equal(
    (await f.call(path, { ...b, actorId: randomUUID() })).status,
    400,
  );
  assert.equal((await f.call(path, { ...b, confirmed: false })).status, 400);
  await f.login("viewer");
  assert.equal((await f.call(path, b)).status, 403);
  await f.login("reviewer");
  assert.equal((await f.call(path, b)).status, 403);
  await f.login("operator");
  const saved = await f.call(path, b);
  assert.equal(saved.status, 201);
  const e = await saved.json();
  assert.equal(e.state, "received");
  assert.deepEqual(e.receivingScans, [
    { instrumentId: i.id, identifier: i.scanIdentifier },
  ]);
  assert.deepEqual(await (await f.call(path, b)).json(), e);
  const current = await (await f.call(f.base + "/instruments/" + i.id)).json();
  assert.equal(current.processingHold.episodeId, e.id);
  assert.equal(
    (await f.call(path, { ...b, requestId: randomUUID(), code: "SECOND" }))
      .status,
    409,
  );
});
test("SQLite receiving scan races reserve once; late audit failure rolls back provenance and receipt", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-receivescan-")),
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
  const { prepareReceivingScanExample } =
    await import("../dist/development/receiving-scan-example.js");
  const i = await prepareReceivingScanExample(repo, s, randomUUID());
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
    new ProcessingRegistry(broken).receiveScanned(s, receipt(i)),
    /audit unavailable/,
  );
  assert.equal((await new ProcessingRegistry(repo).list(s)).items.length, 0);
  assert.equal(
    (await new InstrumentRegistry(repo).get(s, i.id)).processingHold,
    undefined,
  );
  const results = await Promise.allSettled([
    new ProcessingRegistry(repo).receiveScanned(s, receipt(i)),
    new ProcessingRegistry(other).receiveScanned(s, {
      ...receipt(i),
      code: "SECOND",
    }),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const e = results.find((x) => x.status === "fulfilled").value;
  repo.close();
  repo = new PreviewSqliteRepository(file);
  assert.deepEqual(
    (await new ProcessingRegistry(repo).get(s, e.id)).receivingScans,
    e.receivingScans,
  );
  assert.equal(
    (await new InstrumentRegistry(repo).get(s, i.id)).processingHold.episodeId,
    e.id,
  );
});
