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
test("scan lookup is read-only for all roles and returns current scoped holds", async (t) => {
  const f = await httpFixture(t),
    token = "RSP-I-" + f.i.id.toUpperCase(),
    url = f.base + "/instrument-scan?identifier=" + token;
  await f.call(f.base + "/instruments/" + f.i.id + "/maintenance/report", {
    requestId: randomUUID(),
    version: 1,
    defect: "Damaged",
    location: "Quarantine",
    confirmed: true,
  });
  for (const role of ["operator", "reviewer", "viewer"]) {
    await f.login(role);
    const r = await f.call(url);
    assert.equal(r.status, 200);
    const i = await r.json();
    assert.equal(i.id, f.i.id);
    assert.equal(i.scanIdentifier, token);
    assert.equal(i.state, "maintenance");
    assert.equal(i.version, 2);
  }
  assert.equal(
    (
      await f.call(
        f.base + "/instrument-scan?identifier=" + token + "&unknown=x",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base +
          "/instrument-scan?identifier=" +
          token +
          "&identifier=" +
          token,
      )
    ).status,
    400,
  );
  assert.equal(
    (await f.call(f.base + "/instrument-scan?identifier=MANUFACTURER")).status,
    400,
  );
  assert.equal(
    (await f.call(f.base + "/instrument-scan?identifier=RSP-I-" + randomUUID()))
      .status,
    404,
  );
  const foreign = f.base.replace(f.session.facilityId, randomUUID());
  assert.equal(
    (await f.call(foreign + "/instrument-scan?identifier=" + token)).status,
    404,
  );
});
test("fictional scan helper is explicit, operator-only and replay-safe; creates only a demo hold", async (t) => {
  const f = await httpFixture(t),
    input = { requestId: randomUUID() };
  await f.login("reviewer");
  assert.equal((await f.call("/preview/scan-example", input)).status, 403);
  await f.login("operator");
  assert.equal(
    (await f.call("/preview/scan-example", input, { "x-sterile-csrf": "bad" }))
      .status,
    403,
  );
  const r = await f.call("/preview/scan-example", input);
  assert.equal(r.status, 201);
  const i = await r.json();
  assert.equal(i.state, "maintenance");
  assert.match(i.code, /^SCAN-DEMO-/);
  assert.equal(i.scanIdentifier, "RSP-I-" + i.id.toUpperCase());
  assert.deepEqual(
    await (await f.call("/preview/scan-example", input)).json(),
    i,
  );
  assert.equal(
    (
      await (
        await f.call(f.base + "/instrument-scan?identifier=" + i.scanIdentifier)
      ).json()
    ).id,
    i.id,
  );
});
