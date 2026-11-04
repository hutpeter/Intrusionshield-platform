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
  TrayRegistry,
  PackagingRegistry,
  CycleRegistry,
  ReviewRegistry,
  DistributionRegistry,
  RecallRegistry,
  ReturnRegistry,
  TraceabilityRegistry,
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
async function sqlFixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "review-sql-")),
    file = join(dir, "preview.sqlite"),
    repo = new PreviewSqliteRepository(file),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    reviewer = { ...s, actorId: randomUUID() };
  t.after(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const { prepareReviewExample } =
      await import("../dist/development/review-example.js"),
    l = await prepareReviewExample(repo, s, randomUUID());
  return { repo, file, s, reviewer, l, prepareReviewExample };
}
const issue = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  destination: "DEMO-DEPARTMENT",
  recipient: "DEMO-RECEIVER",
  reference: "HANDOVER-DEMO",
  integrityChecked: true,
  confirmed: true,
  ...extra,
});
const store = (f, r, extra = {}) => ({
  requestId: randomUUID(),
  packageId: f.l.packages[0].id,
  packageVersion: f.l.packages[0].version,
  reviewId: r.id,
  reviewVersion: r.version,
  location: "STORE-A",
  reference: "STORAGE-DEMO",
  integrityChecked: true,
  confirmed: true,
  ...extra,
});
const review = (l, extra = {}) => ({
  requestId: randomUUID(),
  loadId: l.id,
  loadVersion: l.version,
  reviewVersion: 0,
  decision: "release",
  reason: "Demo",
  reference: "DEMO",
  cycleChecked: true,
  indicatorsChecked: true,
  packagesChecked: true,
  profileChecked: true,
  confirmed: true,
  ...extra,
});
async function example(f) {
  const r = await f.call("/preview/distribution-example", {
    requestId: randomUUID(),
  });
  assert.equal(r.status, 201);
  return r.json();
}

const returnBody = (d, extra = {}) => ({
  requestId: randomUUID(),
  code: "RETURN-1",
  distributionId: d.id,
  distributionVersion: d.version,
  condition: "used",
  location: "RETURN-QUARANTINE",
  custodian: "DEMO-RETURNER",
  reference: "SIMULATED-RETURN",
  note: "",
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
const disposition = (extra = {}) => ({
  requestId: randomUUID(),
  version: 1,
  action: "reprocess",
  reason: "New cleaning episode",
  reference: "SIMULATED-REPROCESS",
  episodeCode: "NEW-RECEIPT",
  confirmed: true,
  ...extra,
});
async function issued(f) {
  const r = await f.call("/preview/return-example", {
    requestId: randomUUID(),
  });
  assert.equal(r.status, 201);
  return r.json();
}

test("operator, reviewer and viewer can search and read linked history without changing records", async (t) => {
  const f = await httpFixture(t),
    d = await issued(f),
    ret = await (await f.call(f.base + "/returns", returnBody(d))).json();
  await f.login("reviewer");
  const done = await (
    await f.call(f.base + "/returns/" + ret.id + "/dispose", disposition())
  ).json();
  for (const role of ["operator", "reviewer", "viewer"]) {
    await f.login(role);
    let r = await f.call(
      f.base +
        "/traceability?code=" +
        encodeURIComponent(d.packageCode.toLowerCase()),
    );
    assert.equal(r.status, 200);
    const search = await r.json();
    assert.equal(search.matches[0].id, d.packageId);
    assert.equal(search.tenantId, f.session.tenantId);
    r = await f.call(f.base + "/traceability/package/" + d.packageId);
    assert.equal(r.status, 200);
    const report = await r.json();
    assert.ok(report.nodes.some((n) => n.id === done.episodeId));
    assert.ok(
      report.links.some(
        (l) => l.relation === "original_issue" && l.toVersion === 2,
      ),
    );
    assert.ok(report.alerts.some((a) => a.kind === "return_block"));
    assert.ok(report.alerts.some((a) => a.kind === "processing_hold"));
    assert.equal(
      report.nodes.find((n) => n.kind === "review").state,
      "released",
    );
  }
  const current = await (await f.call(f.base + "/returns/" + ret.id)).json();
  assert.equal(current.version, 2);
  assert.equal(
    (await (await f.call(f.base + "/returns/" + ret.id + "/history")).json())
      .items.length,
    2,
  );
});
test("trace routes reject ambiguous query syntax, unsupported roots and foreign facility access", async (t) => {
  const f = await httpFixture(t),
    d = await issued(f);
  for (const q of [
    "",
    "?code=",
    "?code=A&code=B",
    "?code=A&tenantId=" + randomUUID(),
    "?code=A*",
  ])
    assert.equal((await f.call(f.base + "/traceability" + q)).status, 400, q);
  assert.equal(
    (await f.call(f.base + "/traceability/processing/" + d.packageId)).status,
    400,
  );
  assert.equal(
    (await f.call(f.base + "/traceability/package/bad")).status,
    400,
  );
  assert.equal(
    (await f.call(f.base + "/traceability/package/" + randomUUID())).status,
    404,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/traceability/package/" +
          d.packageId,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/traceability/package/" + d.packageId + "?version=1",
      )
    ).status,
    400,
  );
  await f.call("/preview/logout", {});
  assert.equal(
    (await f.call(f.base + "/traceability?code=" + d.packageCode)).status,
    401,
  );
});
test("SQLite trace retains historical membership and excludes co-loaded sibling histories", async (t) => {
  const f = await sqlFixture(t),
    { preparePackagingExample } =
      await import("../dist/development/packaging-example.js"),
    pk = new PackagingRegistry(f.repo),
    cy = new CycleRegistry(f.repo);
  async function pack() {
    const a = await preparePackagingExample(f.repo, f.s, randomUUID());
    return pk.pack(f.s, {
      requestId: randomUUID(),
      code: "PACK-" + randomUUID(),
      assemblyId: a.id,
      assemblyVersion: a.version,
      material: "Demo",
      materialLot: "Lot",
      procedure: "Pack",
      procedureVersion: "1",
      sealChecked: true,
      contentsChecked: true,
      confirmed: true,
    });
  }
  const p = await pack(),
    sibling = await pack(),
    l = await cy.create(f.s, {
      requestId: randomUUID(),
      code: "LOAD-" + randomUUID(),
      sterilizer: "DEMO",
      method: "steam",
      profile: "DEMO",
      profileVersion: "1",
      packageIds: [p.id, sibling.id],
      confirmed: true,
    });
  await cy.contents(f.s, l.id, {
    requestId: randomUUID(),
    version: 1,
    packageIds: [sibling.id],
    confirmed: true,
  });
  const reopened = new PreviewSqliteRepository(f.file);
  t.after(() => reopened.close());
  const trace = new TraceabilityRegistry(reopened),
    i = p.assemblySnapshot.instruments[0],
    report = await trace.report(f.s, "instrument", i.id);
  assert.ok(report.nodes.some((n) => n.id === l.id && n.version === 2));
  assert.equal(
    report.nodes.some((n) => n.id === sibling.id),
    false,
  );
  assert.ok(
    report.links.some(
      (x) => x.fromId === l.id && x.fromVersion === 1 && x.toId === p.id,
    ),
  );
  assert.equal(
    report.links.some(
      (x) => x.fromId === l.id && x.fromVersion === 2 && x.toId === p.id,
    ),
    false,
  );
  const full = await trace.report(f.s, "load", l.id);
  assert.ok(full.nodes.some((n) => n.id === sibling.id));
  assert.ok(full.nodes.some((n) => n.id === p.id));
});
test("SQLite trace search and reports stay tenant/facility scoped, including audit and snapshots", async (t) => {
  const f = await sqlFixture(t),
    trace = new TraceabilityRegistry(f.repo);
  for (const other of [
    { ...f.s, tenantId: randomUUID() },
    { ...f.s, facilityId: randomUUID() },
  ]) {
    assert.deepEqual(await trace.search(other, f.l.code), []);
    await assert.rejects(
      trace.report(other, "load", f.l.id),
      (e) => e.code === "NOT_FOUND",
    );
  }
  const report = await trace.report(f.s, "load", f.l.id);
  assert.ok(report.events.length);
  assert.ok(
    report.events.every(
      (e) => e.tenantId === f.s.tenantId && e.facilityId === f.s.facilityId,
    ),
  );
  assert.equal(report.nodes.filter((n) => n.kind === "load").length, 1);
});
