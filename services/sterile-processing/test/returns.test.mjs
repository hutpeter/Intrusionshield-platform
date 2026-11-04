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
test("operator records return, reviewer authorizes new episode, operator continues cleaning with original issue retained", async (t) => {
  const f = await httpFixture(t),
    d = await issued(f);
  let response = await f.call(f.base + "/returns", returnBody(d));
  assert.equal(response.status, 201);
  const r = await response.json();
  assert.equal(r.issue.state, "issued");
  assert.equal(r.state, "returned");
  assert.equal(
    (await f.call(f.base + "/returns/" + r.id + "/dispose", disposition()))
      .status,
    403,
  );
  assert.equal(
    (await (await f.call(f.base + "/distribution/" + d.id)).json()).returned.id,
    r.id,
  );
  await f.login("reviewer");
  assert.equal(
    (await f.call(f.base + "/returns", returnBody(d, { code: "FORGED" })))
      .status,
    403,
  );
  response = await f.call(
    f.base + "/returns/" + r.id + "/dispose",
    disposition(),
  );
  assert.equal(response.status, 200);
  const done = await response.json();
  assert.equal(done.state, "reprocessing");
  const e = await (
    await f.call(f.base + "/processing/" + done.episodeId)
  ).json();
  assert.equal(e.returnSource.returnId, r.id);
  assert.equal(e.state, "received");
  assert.equal(e.receivedBy, f.session.actorId);
  const events = await (
    await f.call(f.base + "/processing/" + e.id + "/history")
  ).json();
  assert.equal(events.items.length, 1);
  assert.ok(events.items[0].correlationRequestId);
  assert.notEqual(
    events.items[0].requestId,
    events.items[0].correlationRequestId,
  );
  assert.equal(
    (await (await f.call(f.base + "/reviews/" + d.reviewId)).json())
      .returnBlocked,
    true,
  );
  await f.login("operator");
  assert.equal(
    (
      await f.call(f.base + "/processing/" + e.id + "/start", {
        requestId: randomUUID(),
        version: 1,
        method: "manual",
        procedure: "CLEAN",
        procedureVersion: "1",
        equipment: "",
        confirmed: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await f.call(f.base + "/returns/" + r.id + "/versions/1")).json())
      .state,
    "returned",
  );
  assert.equal(
    (
      await (
        await f.call(f.base + "/distribution/" + d.id + "/versions/2")
      ).json()
    ).returned,
    undefined,
  );
  await f.login("viewer");
  assert.equal((await f.call(f.base + "/returns/" + r.id)).status, 200);
  assert.equal(
    (
      await f.call(
        f.base + "/returns/" + r.id + "/dispose",
        disposition({ version: 2 }),
      )
    ).status,
    403,
  );
});
test("return endpoints enforce CSRF, strict fields, source versions and facility scope; fictional helper roles and retry", async (t) => {
  const f = await httpFixture(t),
    key = randomUUID();
  let response = await f.call("/preview/return-example", { requestId: key });
  const d = await response.json();
  response = await f.call("/preview/return-example", { requestId: key });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), d);
  assert.equal(
    (
      await f.call(f.base + "/returns", returnBody(d), {
        "x-sterile-csrf": "bad",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/returns",
        returnBody(d, { actorId: randomUUID() }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/returns",
        returnBody(d, { distributionVersion: 1 }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) + "/returns",
        returnBody(d),
      )
    ).status,
    404,
  );
  await f.login("reviewer");
  assert.equal(
    (await f.call("/preview/return-example", { requestId: randomUUID() }))
      .status,
    403,
  );
  await f.login("viewer");
  assert.equal(
    (await f.call("/preview/return-example", { requestId: randomUUID() }))
      .status,
    403,
  );
});
test("SQLite reopen retains linked episode, original versions and permanent old-package block", async (t) => {
  const f = await sqlFixture(t),
    rr = new ReviewRegistry(f.repo),
    dr = new DistributionRegistry(f.repo),
    rt = new ReturnRegistry(f.repo),
    r = await rr.decide(f.reviewer, review(f.l)),
    stored = await dr.store(f.s, store(f, r)),
    d = await dr.issue(f.s, stored.id, issue(1)),
    ret = await rt.create(f.s, returnBody(d)),
    done = await rt.dispose(f.reviewer, ret.id, disposition());
  const reopened = new PreviewSqliteRepository(f.file);
  t.after(() => reopened.close());
  const read = new ReturnRegistry(reopened);
  assert.equal((await read.get(f.s, ret.id)).episodeId, done.episodeId);
  assert.equal((await read.get(f.s, ret.id, 1)).state, "returned");
  assert.equal(
    (await new ProcessingRegistry(reopened).get(f.s, done.episodeId))
      .returnSource.packageId,
    d.packageId,
  );
  assert.equal(
    (await new PackagingRegistry(reopened).get(f.s, d.packageId)).returned
      .state,
    "reprocessing",
  );
});
test("SQLite audit failure during processing creation rolls back return, assembly and reservations", async (t) => {
  const f = await sqlFixture(t),
    rr = new ReviewRegistry(f.repo),
    dr = new DistributionRegistry(f.repo),
    rt = new ReturnRegistry(f.repo),
    r = await rr.decide(f.reviewer, review(f.l)),
    stored = await dr.store(f.s, store(f, r)),
    d = await dr.issue(f.s, stored.id, issue(1)),
    ret = await rt.create(f.s, returnBody(d));
  const faulty = {
    transaction: (s, work) =>
      f.repo.transaction(s, (tx) =>
        work({
          ...tx,
          appendAudit: async (e) => {
            if (e.action === "processing-received")
              throw Error("audit unavailable");
            return tx.appendAudit(e);
          },
        }),
      ),
  };
  await assert.rejects(
    new ReturnRegistry(faulty).dispose(f.reviewer, ret.id, disposition()),
  );
  assert.equal((await rt.get(f.s, ret.id)).state, "returned");
  const p = await new PackagingRegistry(f.repo).get(f.s, d.packageId);
  assert.equal(
    (await new TrayRegistry(f.repo).assembly(f.s, p.assemblyId)).assembly.state,
    "complete",
  );
  assert.equal(
    await f.repo.transaction(f.s, (tx) =>
      tx.findProcessingByCode("NEW-RECEIPT"),
    ),
    null,
  );
  assert.equal(
    (await f.repo.transaction(f.s, (tx) => tx.findActivePackage(p.assemblyId)))
      .packageId,
    p.id,
  );
});
test("two SQLite connections accept one duplicate return and one processing transfer", async (t) => {
  const f = await sqlFixture(t),
    rr = new ReviewRegistry(f.repo),
    dr = new DistributionRegistry(f.repo),
    r = await rr.decide(f.reviewer, review(f.l)),
    stored = await dr.store(f.s, store(f, r)),
    d = await dr.issue(f.s, stored.id, issue(1)),
    other = new PreviewSqliteRepository(f.file);
  t.after(() => other.close());
  const first = new ReturnRegistry(f.repo),
    second = new ReturnRegistry(other),
    out = await Promise.allSettled([
      first.create(f.s, returnBody(d)),
      second.create(f.s, returnBody(d, { code: "RETURN-2" })),
    ]);
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  const ret = out.find((x) => x.status === "fulfilled").value;
  const results = await Promise.allSettled([
    first.dispose(f.reviewer, ret.id, disposition()),
    second.dispose(
      f.reviewer,
      ret.id,
      disposition({ episodeCode: "OTHER-EPISODE" }),
    ),
  ]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await first.history(f.s, ret.id)).items.length, 2);
});
