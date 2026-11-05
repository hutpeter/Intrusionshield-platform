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

import { prepareLineageRecallExample } from "../dist/development/lineage-recall-example.js";
const recallBody = (x, plan, extra = {}) => ({
  requestId: randomUUID(),
  code: "LINEAGE-RECALL-" + randomUUID(),
  sourceKind: "package",
  sourceId: x.sourcePackage.id,
  sourceVersion: x.sourcePackage.version,
  reason: "Recall ancestor",
  reference: "Demo",
  confirmed: true,
  ...(plan ? { impactHash: plan.impactHash } : {}),
  ...extra,
});
const impactPath = (x) =>
  "/recalls/impact?sourceKind=package&sourceId=" +
  x.sourcePackage.id +
  "&sourceVersion=" +
  x.sourcePackage.version;
async function lineageExample(f) {
  await f.login("reviewer");
  const response = await f.call("/preview/lineage-recall-example", {
    requestId: randomUUID(),
  });
  assert.equal(response.status, 201);
  return response.json();
}
async function legacyRecord(f, x) {
  const now = new Date().toISOString(),
    r = {
      id: randomUUID(),
      tenantId: f.s.tenantId,
      facilityId: f.s.facilityId,
      code: "LEGACY-" + randomUUID(),
      sourceKind: "package",
      sourceId: x.sourcePackage.id,
      sourceVersion: 1,
      sourceCode: x.sourcePackage.code,
      reason: "Original reason",
      reference: "Original reference",
      items: [
        {
          packageId: x.sourcePackage.id,
          packageCode: x.sourcePackage.code,
          packageVersion: 1,
          atRecall: null,
          status: "outstanding",
          recovery: null,
          disposition: null,
        },
      ],
      state: "open",
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: f.reviewer.actorId,
    };
  await f.repo.transaction(f.reviewer, async (tx) => {
    await tx.insertRecall(r);
    await tx.insertRecallVersion(r);
    await tx.insertRecallBlocks(r);
    await tx.appendAudit({
      id: randomUUID(),
      ...f.reviewer,
      entityId: r.id,
      version: 1,
      action: "recall-created",
      requestId: randomUUID(),
      at: now,
      reason: r.reason,
    });
  });
  return r;
}
test("reviewer previews and recalls ancestor plus descendant; operator cannot issue recalled descendant", async (t) => {
  const f = await httpFixture(t),
    x = await lineageExample(f),
    plan = await (await f.call(f.base + impactPath(x))).json();
  assert.equal(plan.items.length, 2);
  assert.equal(
    plan.items.find((i) => i.packageId === x.descendantPackage.id).origin,
    "reprocessed",
  );
  assert.equal(
    (await f.call(f.base + "/recalls", recallBody(x, null))).status,
    409,
  );
  const response = await f.call(f.base + "/recalls", recallBody(x, plan));
  assert.equal(response.status, 201);
  const r = await response.json();
  assert.equal(r.lineage.instrumentIds.length, 1);
  assert.equal(r.items.length, 2);
  const p = await (
    await f.call(f.base + "/packages/" + x.descendantPackage.id)
  ).json();
  assert.equal(p.recall.caseId, r.id);
  const review = await (
    await f.call(f.base + "/reviews/" + p.activeLoad.review.id)
  ).json();
  assert.equal(review.state, "released");
  assert.equal(review.recallBlocked, true);
  await f.login("operator");
  const distribution = await (await f.call(f.base + "/distribution")).json(),
    d = distribution.items.find((d) => d.packageId === x.descendantPackage.id);
  assert.equal(
    (
      await f.call(
        f.base + "/distribution/" + d.id + "/issue",
        issue(d.version),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await f.call(f.base + "/recalls/" + r.id + "/extend", {
        requestId: randomUUID(),
        version: 1,
        impactHash: plan.impactHash,
        reason: "Demo",
        reference: "Demo",
        confirmed: true,
      })
    ).status,
    403,
  );
  const trace = await (
    await f.call(f.base + "/traceability/package/" + x.descendantPackage.id)
  ).json();
  assert.ok(trace.alerts.some((a) => a.kind === "instrument_recall"));
});
test("lineage helper and impact endpoints enforce roles, CSRF, strict fields, scope and idempotent setup", async (t) => {
  const f = await httpFixture(t);
  assert.equal(
    (
      await f.call("/preview/lineage-recall-example", {
        requestId: randomUUID(),
      })
    ).status,
    403,
  );
  await f.login("reviewer");
  const key = randomUUID(),
    one = await (
      await f.call("/preview/lineage-recall-example", { requestId: key })
    ).json(),
    two = await (
      await f.call("/preview/lineage-recall-example", { requestId: key })
    ).json();
  assert.deepEqual(one, two);
  const plan = await (await f.call(f.base + impactPath(one))).json();
  assert.equal(
    (
      await f.call(f.base + "/recalls", recallBody(one, plan), {
        "x-sterile-csrf": "bad",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/recalls",
        recallBody(one, plan, { actorId: randomUUID() }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) + impactPath(one),
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.call(f.base + impactPath(one) + "&tenantId=" + randomUUID()))
      .status,
    400,
  );
  await f.login("viewer");
  assert.equal(
    (
      await f.call("/preview/lineage-recall-example", {
        requestId: randomUUID(),
      })
    ).status,
    403,
  );
  assert.equal((await f.call(f.base + impactPath(one))).status, 200);
  assert.equal(
    (await f.call(f.base + "/recalls", recallBody(one, plan))).status,
    403,
  );
});
test("SQLite extension preserves legacy snapshots and persists descendant and instrument blocks after reopen", async (t) => {
  const f = await sqlFixture(t),
    x = await prepareLineageRecallExample(
      f.repo,
      f.s,
      f.reviewer,
      randomUUID(),
    ),
    old = await legacyRecord(f, x),
    rc = new RecallRegistry(f.repo),
    plan = await rc.caseImpact(f.reviewer, old.id),
    r = await rc.extend(f.reviewer, old.id, {
      requestId: randomUUID(),
      version: 1,
      impactHash: plan.impactHash,
      reason: "Extend descendants",
      reference: "Demo",
      confirmed: true,
    });
  assert.equal(r.items.length, 2);
  const reopened = new PreviewSqliteRepository(f.file);
  t.after(() => reopened.close());
  assert.equal(
    (await new RecallRegistry(reopened).get(f.s, old.id, 1)).items.length,
    1,
  );
  assert.equal(
    (await new RecallRegistry(reopened).get(f.s, old.id)).version,
    2,
  );
  assert.ok(
    (await new PackagingRegistry(reopened).get(f.s, x.descendantPackage.id))
      .recall,
  );
  assert.equal(
    (
      await reopened.transaction(f.s, (tx) =>
        tx.findInstrumentRecallBlock(plan.instruments[0].id),
      )
    ).caseId,
    old.id,
  );
  assert.equal(
    await reopened.transaction({ ...f.s, facilityId: randomUUID() }, (tx) =>
      tx.findInstrumentRecallBlock(plan.instruments[0].id),
    ),
    null,
  );
});
test("SQLite failed audit rolls back extended membership and new instrument holds", async (t) => {
  const f = await sqlFixture(t),
    x = await prepareLineageRecallExample(
      f.repo,
      f.s,
      f.reviewer,
      randomUUID(),
    ),
    old = await legacyRecord(f, x),
    rc = new RecallRegistry(f.repo),
    plan = await rc.caseImpact(f.reviewer, old.id),
    faulty = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async (e) => {
              if (e.action === "recall-expanded")
                throw Error("audit unavailable");
              return tx.appendAudit(e);
            },
          }),
        ),
    };
  await assert.rejects(
    new RecallRegistry(faulty).extend(f.reviewer, old.id, {
      requestId: randomUUID(),
      version: 1,
      impactHash: plan.impactHash,
      reason: "Extend",
      reference: "Demo",
      confirmed: true,
    }),
  );
  assert.equal((await rc.get(f.s, old.id)).version, 1);
  assert.equal(
    (await new PackagingRegistry(f.repo).get(f.s, x.descendantPackage.id))
      .recall,
    undefined,
  );
  assert.equal(
    await f.repo.transaction(f.s, (tx) =>
      tx.findInstrumentRecallBlock(plan.instruments[0].id),
    ),
    null,
  );
});
test("SQLite issue-versus-recall race either invalidates preview or denies issue without losing custody evidence", async (t) => {
  const f = await sqlFixture(t),
    x = await prepareLineageRecallExample(
      f.repo,
      f.s,
      f.reviewer,
      randomUUID(),
    ),
    other = new PreviewSqliteRepository(f.file);
  t.after(() => other.close());
  const rc = new RecallRegistry(f.repo),
    plan = await rc.impact(f.reviewer, "package", x.sourcePackage.id, 1),
    d = await f.repo.transaction(f.s, (tx) =>
      tx.findDistributionByPackage(x.descendantPackage.id),
    );
  const out = await Promise.allSettled([
    new DistributionRegistry(other).issue(f.s, d.id, issue(1)),
    rc.create(f.reviewer, recallBody(x, plan)),
  ]);
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  assert.ok(
    ["CONFLICT", "RECALL_BLOCKED"].includes(
      out.find((x) => x.status === "rejected").reason.code,
    ),
  );
  if (out[1].status === "rejected") {
    const fresh = await rc.impact(f.reviewer, "package", x.sourcePackage.id, 1);
    assert.equal(
      fresh.items.find((i) => i.packageId === x.descendantPackage.id).atRecall
        .state,
      "issued",
    );
    await rc.create(f.reviewer, recallBody(x, fresh));
  }
  assert.ok(
    (await new PackagingRegistry(f.repo).get(f.s, x.descendantPackage.id))
      .recall,
  );
});
