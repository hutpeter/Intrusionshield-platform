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
test("HTTP fictional storage and issue retain release attribution, movement history and package projection", async (t) => {
  const f = await httpFixture(t),
    d = await example(f);
  assert.equal(d.state, "stored");
  let response = await f.call(
    f.base + "/distribution/" + d.id + "/issue",
    issue(1),
  );
  assert.equal(response.status, 200);
  const done = await response.json();
  assert.equal(done.state, "issued");
  assert.equal(done.events[1].actorId, f.session.actorId);
  assert.notEqual(done.releasedBy, done.events[1].actorId);
  assert.equal(
    (
      await (
        await f.call(f.base + "/distribution/" + d.id + "/versions/1")
      ).json()
    ).location,
    "DEMO-STORE-A",
  );
  assert.equal(
    (await (await f.call(f.base + "/distribution/" + d.id + "/history")).json())
      .items.length,
    2,
  );
  const p = await (await f.call(f.base + "/packages/" + d.packageId)).json();
  assert.equal(p.distribution.state, "issued");
  assert.equal(
    (await f.call(f.base + "/distribution/" + d.id + "/issue", issue(2)))
      .status,
    409,
  );
});
test("storage/issue enforce role, CSRF, scope, strict fields and required handover confirmation", async (t) => {
  const f = await httpFixture(t),
    d = await example(f);
  for (const patch of [
    { confirmed: false },
    { integrityChecked: false },
    { recipient: "" },
    { actorId: randomUUID() },
    { state: "issued" },
  ])
    assert.equal(
      (
        await f.call(
          f.base + "/distribution/" + d.id + "/issue",
          issue(1, patch),
        )
      ).status,
      400,
    );
  assert.equal(
    (
      await f.call(f.base + "/distribution/" + d.id + "/issue", issue(1), {
        "x-sterile-csrf": "",
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/distribution/" + d.id + "/issue", issue(2)))
      .status,
    409,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) +
          "/distribution/" +
          d.id,
      )
    ).status,
    404,
  );
  for (const role of ["reviewer", "viewer"]) {
    await f.login(role);
    assert.equal((await f.call(f.base + "/distribution/" + d.id)).status, 200);
    assert.equal(
      (await f.call(f.base + "/distribution/" + d.id + "/history")).status,
      200,
    );
    assert.equal(
      (await f.call(f.base + "/distribution/" + d.id + "/issue", issue(1)))
        .status,
      403,
    );
    assert.equal(
      (
        await f.call("/preview/distribution-example", {
          requestId: randomUUID(),
        })
      ).status,
      403,
    );
  }
});
test("SQLite storage, transfers, issue snapshots and linked source versions survive reopening", async (t) => {
  const f = await sqlFixture(t),
    r = await new ReviewRegistry(f.repo).decide(f.reviewer, review(f.l)),
    dr = new DistributionRegistry(f.repo);
  const d = await dr.store(f.s, store(f, r));
  await dr.transfer(f.s, d.id, {
    requestId: randomUUID(),
    version: 1,
    location: "STORE-B",
    reference: "TRANSFER",
    reason: "Demo relocation",
    integrityChecked: true,
    confirmed: true,
  });
  await dr.issue(f.s, d.id, issue(2));
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    const registry = new DistributionRegistry(reopened),
      latest = await registry.get(f.s, d.id);
    assert.equal(latest.events.length, 3);
    assert.equal(latest.state, "issued");
    assert.equal(latest.reviewId, r.id);
    assert.equal((await registry.get(f.s, d.id, 1)).location, "STORE-A");
    assert.equal((await registry.list(f.s)).items[0].state, "issued");
    assert.equal("events" in (await registry.list(f.s)).items[0], false);
    assert.equal(
      (await new PackagingRegistry(reopened).get(f.s, d.packageId)).distribution
        .state,
      "issued",
    );
  } finally {
    reopened.close();
  }
});
test("SQLite movement audit failures roll back storage/issue and retry receipts without changing release", async (t) => {
  const f = await sqlFixture(t),
    r = await new ReviewRegistry(f.repo).decide(f.reviewer, review(f.l)),
    dr = new DistributionRegistry(f.repo),
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
    },
    b = store(f, r);
  await assert.rejects(new DistributionRegistry(broken).store(f.s, b));
  assert.equal((await dr.list(f.s)).items.length, 0);
  const d = await dr.store(f.s, b),
    cmd = issue(1);
  await assert.rejects(new DistributionRegistry(broken).issue(f.s, d.id, cmd));
  assert.equal((await dr.get(f.s, d.id)).state, "stored");
  await assert.rejects(dr.get(f.s, d.id, 2), (e) => e.code === "NOT_FOUND");
  assert.equal((await dr.issue(f.s, d.id, cmd)).state, "issued");
  assert.equal(
    (await new ReviewRegistry(f.repo).get(f.s, r.id)).state,
    "released",
  );
});
test("separate SQLite connections cannot issue the same stored package twice", async (t) => {
  const f = await sqlFixture(t),
    r = await new ReviewRegistry(f.repo).decide(f.reviewer, review(f.l)),
    dr = new DistributionRegistry(f.repo),
    d = await dr.store(f.s, store(f, r)),
    other = new PreviewSqliteRepository(f.file);
  try {
    const results = await Promise.allSettled([
      dr.issue(f.s, d.id, issue(1)),
      new DistributionRegistry(other).issue(
        f.s,
        d.id,
        issue(1, { destination: "OTHER" }),
      ),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "CONFLICT",
    );
    assert.equal((await dr.get(f.s, d.id)).events.length, 2);
  } finally {
    other.close();
  }
});
test("held/rejected approvals cannot be used as storage authority", async (t) => {
  for (const decision of ["hold", "reject"]) {
    const f = await sqlFixture(t),
      r = await new ReviewRegistry(f.repo).decide(
        f.reviewer,
        review(f.l, { decision }),
      );
    await assert.rejects(
      new DistributionRegistry(f.repo).store(f.s, store(f, r)),
      (e) => e.code === "DISTRIBUTION_BLOCKED",
    );
  }
});
test("staged fictional setup retries resume safely after final-storage audit failure, preserving actor separation", async (t) => {
  const f = await sqlFixture(t),
    { prepareDistributionExample } =
      await import("../dist/development/distribution-example.js"),
    key = randomUUID(),
    broken = {
      fictionalTransaction: (s, work) =>
        f.repo.fictionalTransaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async (e) => {
              if (e.action === "package-stored")
                throw Error("synthetic storage failure");
              return tx.appendAudit(e);
            },
          }),
        ),
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async (e) => {
              if (e.action === "package-stored")
                throw Error("synthetic storage failure");
              return tx.appendAudit(e);
            },
          }),
        ),
    };
  await assert.rejects(
    prepareDistributionExample(broken, f.s, f.reviewer, key),
  );
  assert.equal(
    (await new DistributionRegistry(f.repo).list(f.s)).items.length,
    0,
  );
  const count = (await new InstrumentRegistry(f.repo).list(f.s)).items.length,
    d = await prepareDistributionExample(f.repo, f.s, f.reviewer, key);
  assert.equal(d.state, "stored");
  assert.equal(
    (await new InstrumentRegistry(f.repo).list(f.s)).items.length,
    count,
  );
  assert.equal(d.releasedBy, f.reviewer.actorId);
  assert.deepEqual(
    await prepareDistributionExample(f.repo, f.s, f.reviewer, key),
    d,
  );
});

test("SQLite integrity hold survives reopen and blocks release and distribution while preserving source versions", async (t) => {
  const f = await sqlFixture(t),
    pk = new PackagingRegistry(f.repo),
    id = f.l.packages[0].id;
  const r = await new ReviewRegistry(f.repo).decide(f.reviewer, {
    requestId: randomUUID(),
    loadId: f.l.id,
    loadVersion: f.l.version,
    reviewVersion: 0,
    decision: "release",
    reason: "SIMULATED review",
    reference: "SIMULATED",
    cycleChecked: true,
    indicatorsChecked: true,
    packagesChecked: true,
    profileChecked: true,
    confirmed: true,
  });
  const d = await new DistributionRegistry(f.repo).store(f.s, store(f, r));
  const held = await pk.holdIntegrity(f.s, id, {
    requestId: randomUUID(),
    packageVersion: 1,
    reason: "SIMULATED wet wrap",
    evidence: "SIMULATED-EVIDENCE",
    location: "DEMO-HOLD",
    confirmed: true,
  });
  const reopened = new PreviewSqliteRepository(f.file);
  try {
    assert.deepEqual(
      (await new PackagingRegistry(reopened).get(f.s, id)).integrityHold,
      held,
    );
    assert.equal(
      (await new PackagingRegistry(reopened).get(f.s, id, 1)).integrityHold,
      undefined,
    );
    await assert.rejects(
      new DistributionRegistry(reopened).issue(f.s, d.id, issue(1)),
      { code: "PACKAGE_INTEGRITY_BLOCKED" },
    );
    assert.equal(
      (await new ReviewRegistry(reopened).get(f.s, r.id)).packageSafetyBlocked,
      true,
    );
    const { DashboardRegistry } =
      await import("@intrusionshield/sterile-processing");
    assert.equal(
      (await new DashboardRegistry(reopened).queue(f.s, "packageAlerts")).queue
        .total,
      1,
    );
    assert.equal(
      (
        await new DashboardRegistry(reopened).queue(
          { ...f.s, facilityId: randomUUID() },
          "packageAlerts",
        )
      ).queue.total,
      0,
    );
  } finally {
    reopened.close();
  }
});
