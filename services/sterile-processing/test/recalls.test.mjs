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
const caseBody = (d, extra = {}) => ({
  requestId: randomUUID(),
  code: "RECALL-1",
  sourceKind: "package",
  sourceId: d.packageId,
  sourceVersion: d.packageVersion,
  reason: "Fictional recall",
  reference: "RECALL-DEMO",
  confirmed: true,
  ...extra,
});
const recoverBody = (d, version = 1) => ({
  requestId: randomUUID(),
  version,
  packageId: d.packageId,
  location: "QUARANTINE-A",
  reference: "RECOVERY-DEMO",
  note: "",
  confirmed: true,
});
const disposeBody = (d, version = 2) => ({
  requestId: randomUUID(),
  version,
  packageId: d.packageId,
  action: "quarantine",
  reason: "Fictional disposition",
  reference: "DISPOSITION-DEMO",
  confirmed: true,
});
async function recalledExample(f) {
  await f.login("reviewer");
  const response = await f.call("/preview/recall-example", {
    requestId: randomUUID(),
  });
  assert.equal(response.status, 201);
  const d = await response.json();
  return {
    d,
    case: await (await f.call(f.base + "/recalls", caseBody(d))).json(),
  };
}
test("reviewer creates recall; operator recovers; reviewer disposes; case closure retains block and original release", async (t) => {
  const f = await httpFixture(t),
    { d, case: r } = await recalledExample(f);
  assert.equal(r.state, "open");
  assert.equal(r.items[0].atRecall.location, "DEMO-STORE-A");
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/recover", recoverBody(d)))
      .status,
    403,
  );
  await f.login("operator");
  assert.equal(
    (await f.call(f.base + "/distribution/" + d.id + "/issue", issue(1)))
      .status,
    409,
  );
  assert.equal(
    (await f.call(f.base + "/recalls", caseBody(d, { code: "DENIED" }))).status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/recover", recoverBody(d)))
      .status,
    200,
  );
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/dispose", disposeBody(d)))
      .status,
    403,
  );
  await f.login("reviewer");
  const disposed = await f.call(
    f.base + "/recalls/" + r.id + "/dispose",
    disposeBody(d),
  );
  assert.equal(disposed.status, 200);
  assert.equal((await disposed.json()).state, "closed");
  const review = await (await f.call(f.base + "/reviews/" + d.reviewId)).json();
  assert.equal(review.state, "released");
  assert.equal(review.recallBlocked, true);
  assert.equal(
    (await (await f.call(f.base + "/recalls/" + r.id + "/versions/1")).json())
      .items[0].status,
    "outstanding",
  );
  assert.equal(
    (await (await f.call(f.base + "/recalls/" + r.id + "/history")).json())
      .items.length,
    3,
  );
});
test("recall API enforces CSRF, strict fields, source scope and read-only role", async (t) => {
  const f = await httpFixture(t);
  await f.login("reviewer");
  const d = await (
    await f.call("/preview/recall-example", { requestId: randomUUID() })
  ).json();
  for (const patch of [
    { confirmed: false },
    { reason: "" },
    { actorId: randomUUID() },
    { state: "closed" },
  ])
    assert.equal(
      (await f.call(f.base + "/recalls", caseBody(d, patch))).status,
      400,
    );
  assert.equal(
    (await f.call(f.base + "/recalls", caseBody(d), { "x-sterile-csrf": "" }))
      .status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/recalls", caseBody(d, { sourceVersion: 99 })))
      .status,
    409,
  );
  const r = await (await f.call(f.base + "/recalls", caseBody(d))).json();
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) + "/recalls/" + r.id,
      )
    ).status,
    404,
  );
  await f.login("viewer");
  for (const path of [
    "/recalls",
    "/recalls/" + r.id,
    "/recalls/" + r.id + "/versions/1",
    "/recalls/" + r.id + "/history",
  ])
    assert.equal((await f.call(f.base + path)).status, 200);
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/recover", recoverBody(d)))
      .status,
    403,
  );
  assert.equal(
    (await f.call("/preview/recall-example", { requestId: randomUUID() }))
      .status,
    403,
  );
});
async function storedSql(f) {
  const r = await new ReviewRegistry(f.repo).decide(f.reviewer, review(f.l));
  return new DistributionRegistry(f.repo).store(f.s, store(f, r));
}
test("SQLite recall blocks, recovery/disposition history and immutable snapshots survive reopening", async (t) => {
  const f = await sqlFixture(t),
    d = await storedSql(f),
    rc = new RecallRegistry(f.repo),
    r = await rc.create(f.reviewer, caseBody(d));
  await rc.recover(f.s, r.id, recoverBody(d));
  await rc.dispose(f.reviewer, r.id, disposeBody(d));
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const registry = new RecallRegistry(reopened);
    assert.equal((await registry.get(f.s, r.id)).state, "closed");
    assert.equal(
      (await registry.get(f.s, r.id, 1)).items[0].status,
      "outstanding",
    );
    assert.equal((await registry.history(f.s, r.id)).items.length, 3);
    assert.equal(
      (await new PackagingRegistry(reopened).get(f.s, d.packageId)).recall
        .caseId,
      r.id,
    );
    assert.equal(
      (await new ReviewRegistry(reopened).get(f.s, d.reviewId)).recallBlocked,
      true,
    );
    await assert.rejects(
      new DistributionRegistry(reopened).issue(f.s, d.id, issue(1)),
      (e) => e.code === "RECALL_BLOCKED",
    );
  } finally {
    reopened.close();
  }
});
test("SQLite recall audit failure rolls back blocking and preserves availability until successful retry", async (t) => {
  const f = await sqlFixture(t),
    d = await storedSql(f),
    rc = new RecallRegistry(f.repo),
    b = caseBody(d),
    broken = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("synthetic failure");
            },
          }),
        ),
    };
  await assert.rejects(new RecallRegistry(broken).create(f.reviewer, b));
  assert.equal((await rc.list(f.s)).items.length, 0);
  assert.equal(
    (await new PackagingRegistry(f.repo).get(f.s, d.packageId)).recall,
    undefined,
  );
  const r = await rc.create(f.reviewer, b);
  await assert.rejects(
    new RecallRegistry(broken).recover(f.s, r.id, recoverBody(d)),
  );
  assert.equal((await rc.get(f.s, r.id)).items[0].status, "outstanding");
  assert.equal(
    (await new PackagingRegistry(f.repo).get(f.s, d.packageId)).recall.caseId,
    r.id,
  );
});
test("racing SQLite issue/recall either blocks issue or captures the issued destination without losing traceability", async (t) => {
  const f = await sqlFixture(t),
    d = await storedSql(f),
    other = new PreviewSqliteRepository(f.file);
  try {
    const results = await Promise.allSettled([
      new RecallRegistry(f.repo).create(f.reviewer, caseBody(d)),
      new DistributionRegistry(other).issue(f.s, d.id, issue(1)),
    ]);
    assert.equal(results[0].status, "fulfilled");
    const r = results[0].value;
    if (results[1].status === "fulfilled") {
      assert.equal(r.items[0].atRecall.state, "issued");
      assert.equal(r.items[0].atRecall.destination, "DEMO-DEPARTMENT");
    } else {
      assert.equal(results[1].reason.code, "RECALL_BLOCKED");
      assert.equal(r.items[0].atRecall.state, "stored");
    }
    assert.ok(
      (await new PackagingRegistry(f.repo).get(f.s, d.packageId)).recall,
    );
  } finally {
    other.close();
  }
});
test("overlapping SQLite cases keep blocks after one closes and cannot allow label reactivation", async (t) => {
  const f = await sqlFixture(t),
    d = await storedSql(f),
    rc = new RecallRegistry(f.repo),
    a = await rc.create(f.reviewer, caseBody(d));
  await rc.create(
    f.reviewer,
    caseBody(d, {
      code: "RECALL-2",
      sourceKind: "load",
      sourceId: f.l.id,
      sourceVersion: f.l.version,
    }),
  );
  await rc.recover(f.s, a.id, recoverBody(d));
  await rc.dispose(f.reviewer, a.id, disposeBody(d));
  const p = await new PackagingRegistry(f.repo).get(f.s, d.packageId);
  assert.equal(p.recall.count, 2);
  assert.equal(
    (await new ReviewRegistry(f.repo).get(f.s, d.reviewId)).recallBlocked,
    true,
  );
});
