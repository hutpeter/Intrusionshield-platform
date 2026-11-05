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

import { prepareRecallClearanceExample } from "../dist/development/recall-clearance-example.js";
const clearBody = (version, extra = {}) => ({
  requestId: randomUUID(),
  version,
  resolution: "SIMULATED resolved cause",
  evidence: "SIMULATED-RESOLUTION",
  procedure: "SIMULATED-REPROCESS",
  procedureVersion: "1",
  causeReviewed: true,
  recoveryReviewed: true,
  dispositionReviewed: true,
  reprocessingRequired: true,
  confirmed: true,
  ...extra,
});
const admitBody = (r, plan, extra = {}) => ({
  requestId: randomUUID(),
  version: r.version,
  impactHash: plan.impactHash,
  episodeCode: "CLEARANCE-RECEIPT-" + randomUUID(),
  custodian: "Demo operator",
  location: "DEMO-NEW-RECEIVING",
  condition: "Held for fresh processing",
  reference: "SIMULATED-READMISSION",
  note: "",
  contentsChecked: true,
  confirmed: true,
  ...extra,
});
async function sample(f) {
  await f.login("reviewer");
  const response = await f.call("/preview/recall-clearance-example", {
    requestId: randomUUID(),
  });
  assert.equal(response.status, 201);
  return response.json();
}
async function closeOther(f, rc, r) {
  for (const i of r.items) {
    r = await rc.recover(f.s, r.id, {
      requestId: randomUUID(),
      version: r.version,
      packageId: i.packageId,
      location: "Demo",
      reference: "Demo",
      note: "Simulated reconciliation",
      confirmed: true,
    });
    r = await rc.dispose(f.reviewer, r.id, {
      requestId: randomUUID(),
      version: r.version,
      packageId: i.packageId,
      action: "reprocess_required",
      reason: "Reviewed",
      reference: "Demo",
      confirmed: true,
    });
  }
  return r;
}
test("reviewer clears, operator admits fresh receiving and original packages/releases remain blocked", async (t) => {
  const f = await httpFixture(t),
    r = await sample(f);
  assert.equal(r.state, "closed");
  await f.login("operator");
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/clear", clearBody(r.version)))
      .status,
    403,
  );
  await f.login("reviewer");
  const response = await f.call(
    f.base + "/recalls/" + r.id + "/clear",
    clearBody(r.version),
  );
  assert.equal(response.status, 200);
  const c = await response.json(),
    plan = await (
      await f.call(f.base + "/recalls/" + r.id + "/admission-plan")
    ).json();
  assert.equal(plan.ready, true);
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/admit", admitBody(c, plan)))
      .status,
    403,
  );
  await f.login("operator");
  const aResponse = await f.call(
    f.base + "/recalls/" + r.id + "/admit",
    admitBody(c, plan),
  );
  assert.equal(aResponse.status, 200);
  const a = await aResponse.json(),
    episodeId = a.admissions[0].episodeId,
    e = await (await f.call(f.base + "/processing/" + episodeId)).json();
  assert.equal(e.state, "received");
  assert.equal(e.receivedBy, f.session.actorId);
  assert.equal(e.attempts.length, 0);
  assert.equal(e.recallSource.caseId, r.id);
  const i = await (
    await f.call(f.base + "/instruments/" + r.lineage.instrumentIds[0])
  ).json();
  assert.equal(i.recall, undefined);
  assert.equal(i.processingHold.episodeId, e.id);
  const child = r.items.find((i) => i.origin === "reprocessed"),
    p = await (await f.call(f.base + "/packages/" + child.packageId)).json();
  assert.equal(p.recall.caseId, r.id);
  const review = await (
    await f.call(f.base + "/reviews/" + p.activeLoad.review.id)
  ).json();
  assert.equal(review.state, "released");
  assert.equal(review.recallBlocked, true);
  assert.equal(
    (
      await (
        await f.call(f.base + "/recalls/" + r.id + "/versions/" + r.version)
      ).json()
    ).clearance,
    undefined,
  );
  assert.equal(
    (await (await f.call(f.base + "/recalls/" + r.id)).json()).readmission
      .pendingInstrumentIds.length,
    0,
  );
  const trace = await (
    await f.call(f.base + "/traceability/package/" + child.packageId)
  ).json();
  assert.ok(
    trace.nodes
      .find((n) => n.kind === "recall" && n.id === r.id)
      .snapshots.some((s) => s.facts.some((f) => f.kind === "clearance")),
  );
  await f.login("viewer");
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/clear", clearBody(a.version)))
      .status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/admit", admitBody(a, plan)))
      .status,
    403,
  );
});
test("clearance API protects CSRF, checked evidence, strict bodies, facility scope and helper replay", async (t) => {
  const f = await httpFixture(t);
  assert.equal(
    (
      await f.call("/preview/recall-clearance-example", {
        requestId: randomUUID(),
      })
    ).status,
    403,
  );
  await f.login("reviewer");
  const key = randomUUID(),
    r = await (
      await f.call("/preview/recall-clearance-example", { requestId: key })
    ).json();
  assert.deepEqual(
    await (
      await f.call("/preview/recall-clearance-example", { requestId: key })
    ).json(),
    r,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/recalls/" + r.id + "/clear",
        clearBody(r.version),
        { "x-sterile-csrf": "bad" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/recalls/" + r.id + "/clear",
        clearBody(r.version, { causeReviewed: false }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/recalls/" + r.id + "/clear",
        clearBody(r.version, { actorId: randomUUID() }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/recalls/" +
          r.id +
          "/clear",
        clearBody(r.version),
      )
    ).status,
    404,
  );
  assert.equal(
    (await f.call(f.base + "/recalls/" + r.id + "/clear", clearBody(1))).status,
    409,
  );
});
test("SQLite clearance/readmission survives reopen with immutable old versions and fresh processing holds", async (t) => {
  const f = await sqlFixture(t),
    r = await prepareRecallClearanceExample(
      f.repo,
      f.s,
      f.reviewer,
      randomUUID(),
    ),
    rc = new RecallRegistry(f.repo),
    c = await rc.clear(f.reviewer, r.id, clearBody(r.version)),
    a = await rc.admit(
      f.s,
      r.id,
      admitBody(c, await rc.admissionPlan(f.s, r.id)),
    ),
    reopened = new PreviewSqliteRepository(f.file);
  t.after(() => reopened.close());
  const read = new RecallRegistry(reopened),
    current = await read.get(f.s, r.id),
    e = await new ProcessingRegistry(reopened).get(
      f.s,
      a.admissions[0].episodeId,
    );
  assert.equal(current.readmission.pendingInstrumentIds.length, 0);
  assert.equal(current.clearance.actorId, f.reviewer.actorId);
  assert.equal((await read.get(f.s, r.id, r.version)).clearance, undefined);
  assert.equal(e.state, "received");
  assert.equal(
    (
      await new InstrumentRegistry(reopened).get(
        f.s,
        r.lineage.instrumentIds[0],
      )
    ).processingHold.episodeId,
    e.id,
  );
  assert.equal(
    (
      await new InstrumentRegistry(reopened).get(
        f.s,
        r.lineage.instrumentIds[0],
      )
    ).recall,
    undefined,
  );
  for (const item of r.items)
    assert.equal(
      (await new PackagingRegistry(reopened).get(f.s, item.packageId)).recall
        .caseId,
      r.id,
    );
});
test("late SQLite audit failure restores decision versions, package reservations, holds and readmission links", async (t) => {
  const f = await sqlFixture(t),
    r = await prepareRecallClearanceExample(
      f.repo,
      f.s,
      f.reviewer,
      randomUUID(),
    ),
    rc = new RecallRegistry(f.repo),
    fail = (action) => ({
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async (e) => {
              if (e.action === action) throw Error("audit unavailable");
              return tx.appendAudit(e);
            },
          }),
        ),
    });
  await assert.rejects(
    new RecallRegistry(fail("recall-cleared-for-reprocessing")).clear(
      f.reviewer,
      r.id,
      clearBody(r.version),
    ),
  );
  assert.equal((await rc.get(f.s, r.id)).clearance, undefined);
  const c = await rc.clear(f.reviewer, r.id, clearBody(r.version)),
    plan = await rc.admissionPlan(f.s, r.id),
    body = admitBody(c, plan);
  await assert.rejects(
    new RecallRegistry(fail("recall-reprocessing-admitted")).admit(
      f.s,
      r.id,
      body,
    ),
  );
  assert.equal((await rc.get(f.s, r.id)).version, c.version);
  assert.equal(
    (await rc.get(f.s, r.id)).readmission.pendingInstrumentIds.length,
    1,
  );
  assert.equal(
    await f.repo.transaction(f.s, (tx) =>
      tx.findProcessingByCode(body.episodeCode),
    ),
    null,
  );
  assert.ok(
    (await new InstrumentRegistry(f.repo).get(f.s, r.lineage.instrumentIds[0]))
      .recall,
  );
  const a = plan.assemblies[0];
  assert.equal(
    (await f.repo.transaction(f.s, (tx) => tx.findActivePackage(a.id)))
      .packageId,
    a.packageId,
  );
});
test("two SQLite connections accept only one clearance and one receiving admission", async (t) => {
  const f = await sqlFixture(t),
    r = await prepareRecallClearanceExample(
      f.repo,
      f.s,
      f.reviewer,
      randomUUID(),
    ),
    other = new PreviewSqliteRepository(f.file);
  t.after(() => other.close());
  const one = new RecallRegistry(f.repo),
    two = new RecallRegistry(other),
    out = await Promise.allSettled([
      one.clear(f.reviewer, r.id, clearBody(r.version)),
      two.clear(f.reviewer, r.id, clearBody(r.version)),
    ]);
  assert.equal(out.filter((x) => x.status === "fulfilled").length, 1);
  const c = out.find((x) => x.status === "fulfilled").value,
    plan = await one.admissionPlan(f.s, r.id),
    admissions = await Promise.allSettled([
      one.admit(f.s, r.id, admitBody(c, plan)),
      two.admit(f.s, r.id, admitBody(c, plan)),
    ]);
  assert.equal(admissions.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await one.get(f.s, r.id)).admissions.length, 1);
  assert.equal(
    (await one.get(f.s, r.id)).readmission.pendingInstrumentIds.length,
    0,
  );
});
test("SQLite overlapping cases stay blocked until all clearances and one admission registers every matching case", async (t) => {
  const f = await sqlFixture(t),
    r = await prepareRecallClearanceExample(
      f.repo,
      f.s,
      f.reviewer,
      randomUUID(),
    ),
    rc = new RecallRegistry(f.repo),
    source = { id: r.sourceId, version: r.sourceVersion },
    plan = await rc.impact(f.reviewer, "package", source.id, source.version);
  let b = await rc.create(f.reviewer, {
    requestId: randomUUID(),
    code: "OVERLAP-" + randomUUID(),
    sourceKind: "package",
    sourceId: source.id,
    sourceVersion: source.version,
    reason: "Demo overlap",
    reference: "Demo",
    confirmed: true,
    impactHash: plan.impactHash,
  });
  b = await closeOther(f, rc, b);
  const a = await rc.clear(f.reviewer, r.id, clearBody(r.version));
  assert.equal((await rc.admissionPlan(f.s, a.id)).ready, false);
  assert.equal(
    (await new InstrumentRegistry(f.repo).get(f.s, r.lineage.instrumentIds[0]))
      .recall.count,
    2,
  );
  await rc.clear(f.reviewer, b.id, clearBody(b.version));
  await rc.admit(f.s, a.id, admitBody(a, await rc.admissionPlan(f.s, a.id)));
  assert.equal(
    (await new InstrumentRegistry(f.repo).get(f.s, r.lineage.instrumentIds[0]))
      .recall,
    undefined,
  );
  assert.equal(
    (await rc.get(f.s, b.id)).readmission.pendingInstrumentIds.length,
    0,
  );
  assert.equal(
    (await new PackagingRegistry(f.repo).get(f.s, r.items[0].packageId)).recall
      .count,
    2,
  );
});
