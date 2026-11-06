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
test("distribution scan setup is operator-only and lookup is scoped/read-only with current movement gates", async (t) => {
  const f = await httpFixture(t),
    b = { requestId: randomUUID() };
  await f.login("reviewer");
  assert.equal(
    (await f.call("/preview/distribution-scan-example", b)).status,
    403,
  );
  await f.login("operator");
  const setup = await f.call("/preview/distribution-scan-example", b);
  assert.equal(setup.status, 201);
  const p = await setup.json();
  assert.equal(p.distribution, undefined);
  const path = f.base + "/distribution-scan?identifier=" + p.scanIdentifier;
  for (const role of ["viewer", "reviewer", "operator"]) {
    await f.login(role);
    const r = await f.call(path);
    assert.equal(r.status, 200);
    const found = await r.json();
    assert.equal(found.distribution, null);
    assert.equal(found.package.id, p.id);
    assert.equal("inspectionProofs" in found.package, false);
    assert.equal("assemblySnapshot" in found.package, false);
    assert.equal(found.package.activeLoad.review.state, "released");
  }
  assert.equal((await f.call(path + "&extra=x")).status, 400);
  assert.equal(
    (await f.call(f.base + "/distribution-scan?identifier=RSP-I-" + p.id))
      .status,
    400,
  );
  const review = p.activeLoad.review,
    input = {
      requestId: randomUUID(),
      packageId: p.id,
      packageVersion: p.version,
      reviewId: review.id,
      reviewVersion: review.version,
      location: "DEMO-SCAN-STORE-A",
      reference: "SIMULATED-SCAN-STORAGE",
      integrityChecked: true,
      confirmed: true,
    };
  const stored = await f.call(f.base + "/distribution", input);
  assert.equal(stored.status, 201);
  const d = await stored.json();
  assert.equal(
    (await (await f.call(path)).json()).distribution.location,
    "DEMO-SCAN-STORE-A",
  );
  const issued = await f.call(f.base + "/distribution/" + d.id + "/issue", {
    requestId: randomUUID(),
    version: 1,
    destination: "DEMO-DEPARTMENT",
    recipient: "DEMO-RECIPIENT",
    reference: "HANDOVER",
    integrityChecked: true,
    confirmed: true,
  });
  assert.equal(issued.status, 200);
  assert.equal((await f.call(path)).status, 409);
});
