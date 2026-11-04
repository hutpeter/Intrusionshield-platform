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
const decisionBody = (l, extra = {}) => ({
  requestId: randomUUID(),
  loadId: l.id,
  loadVersion: l.version,
  reviewVersion: 0,
  decision: "release",
  reason: "Demo review",
  reference: "SIMULATED-REVIEW",
  cycleChecked: true,
  indicatorsChecked: true,
  packagesChecked: true,
  profileChecked: true,
  confirmed: true,
  ...extra,
});
async function example(f) {
  const r = await f.call("/preview/review-example", {
    requestId: randomUUID(),
  });
  assert.equal(r.status, 201);
  return r.json();
}
test("only reviewer permission can decide; operators and auditors cannot release and reviewer cannot alter operator work", async (t) => {
  const f = await httpFixture(t);
  assert.equal(
    (await f.call("/preview/review-example", { requestId: randomUUID() }))
      .status,
    403,
  );
  const reviewer = await f.login("reviewer");
  assert.equal(reviewer.canWrite, false);
  assert.equal(reviewer.canReview, true);
  const l = await example(f);
  assert.equal(
    (
      await f.call(f.base + "/instrument-types", {
        requestId: randomUUID(),
        code: "DENIED",
        name: "Denied",
        manufacturer: "",
        model: "",
      })
    ).status,
    403,
  );
  await f.login("operator");
  assert.equal(
    (await f.call(f.base + "/reviews", decisionBody(l))).status,
    403,
  );
  await f.login("viewer");
  assert.equal(
    (await f.call(f.base + "/reviews", decisionBody(l))).status,
    403,
  );
  await f.login("reviewer");
  const r = await f.call(f.base + "/reviews", decisionBody(l));
  assert.equal(r.status, 201);
  const review = await r.json();
  assert.equal(review.state, "released");
  assert.equal(review.decisions[0].actorId, f.session.actorId);
  assert.notEqual(review.decisions[0].actorId, l.finishedBy);
  assert.equal(
    (await (await f.call(f.base + "/loads/" + l.id)).json()).review.state,
    "released",
  );
  const p = await (
    await f.call(f.base + "/packages/" + l.packages[0].id)
  ).json();
  assert.equal(p.activeLoad.review.state, "released");
  assert.equal(p.state, "packaged");
});
test("review API requires confirmations and checks, rejects forged decision fields, stale versions and CSRF", async (t) => {
  const f = await httpFixture(t);
  await f.login("reviewer");
  const l = await example(f);
  for (const patch of [
    { confirmed: false },
    { profileChecked: false },
    { reason: "" },
    { reference: "" },
    { actorId: randomUUID() },
    { state: "released" },
    { released: true },
  ])
    assert.equal(
      (await f.call(f.base + "/reviews", decisionBody(l, patch))).status,
      400,
    );
  assert.equal(
    (
      await f.call(f.base + "/reviews", decisionBody(l), {
        "x-sterile-csrf": "",
      })
    ).status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/reviews", decisionBody(l, { reviewVersion: 1 })))
      .status,
    409,
  );
  assert.equal(
    (await f.call(f.base + "/reviews?extra=1", decisionBody(l))).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) + "/reviews/queue",
      )
    ).status,
    404,
  );
});
test("hold then release retains decision versions/history and removes final records from review queue", async (t) => {
  const f = await httpFixture(t);
  await f.login("reviewer");
  const l = await example(f);
  let r = await f.call(
    f.base + "/reviews",
    decisionBody(l, { decision: "hold", indicatorsChecked: false }),
  );
  assert.equal(r.status, 201);
  const held = await r.json();
  assert.equal(held.state, "held");
  assert.ok(
    (await (await f.call(f.base + "/reviews/queue")).json()).items.some(
      (x) => x.id === l.id && x.reviewVersion === 1,
    ),
  );
  r = await f.call(f.base + "/reviews", decisionBody(l, { reviewVersion: 1 }));
  assert.equal(r.status, 201);
  const released = await r.json();
  assert.equal(released.decisions.length, 2);
  assert.equal(
    (
      await (
        await f.call(f.base + "/reviews/" + released.id + "/versions/1")
      ).json()
    ).state,
    "held",
  );
  assert.equal(
    (
      await (
        await f.call(f.base + "/reviews/" + released.id + "/history")
      ).json()
    ).items.length,
    2,
  );
  assert.equal(
    (await (await f.call(f.base + "/reviews/queue")).json()).items.some(
      (x) => x.id === l.id,
    ),
    false,
  );
  await f.login("viewer");
  for (const path of [
    "/reviews",
    "/reviews/" + released.id,
    "/reviews/" + released.id + "/history",
    "/reviews/" + released.id + "/versions/1",
  ])
    assert.equal((await f.call(f.base + path)).status, 200);
});
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
test("SQLite release projections, source snapshot and held version survive reopening", async (t) => {
  const f = await sqlFixture(t),
    registry = new ReviewRegistry(f.repo);
  const held = await registry.decide(
    f.reviewer,
    decisionBody(f.l, { decision: "hold" }),
  );
  await registry.decide(f.reviewer, decisionBody(f.l, { reviewVersion: 1 }));
  const r = new PreviewSqliteRepository(f.file);
  try {
    const rr = new ReviewRegistry(r);
    assert.equal((await rr.get(f.reviewer, held.id)).state, "released");
    assert.equal((await rr.get(f.reviewer, held.id, 1)).state, "held");
    assert.equal((await rr.history(f.reviewer, held.id)).items.length, 2);
    assert.equal(
      (await new PackagingRegistry(r).get(f.s, f.l.packages[0].id)).activeLoad
        .review.state,
      "released",
    );
    assert.equal((await new CycleRegistry(r).get(f.s, f.l.id)).version, 3);
    assert.equal((await rr.queue(f.reviewer)).items.length, 0);
  } finally {
    r.close();
  }
});
test("SQLite review audit failure rolls back record, history, projection and retry receipt", async (t) => {
  const f = await sqlFixture(t),
    registry = new ReviewRegistry(f.repo),
    broken = {
      transaction: (s, work) =>
        f.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("synthetic audit failure");
            },
          }),
        ),
    },
    b = decisionBody(f.l);
  await assert.rejects(new ReviewRegistry(broken).decide(f.reviewer, b));
  assert.equal((await registry.list(f.reviewer)).items.length, 0);
  assert.equal((await registry.queue(f.reviewer)).items[0].reviewVersion, 0);
  assert.equal(
    (await new PackagingRegistry(f.repo).get(f.s, f.l.packages[0].id))
      .activeLoad.review,
    undefined,
  );
  const saved = await registry.decide(f.reviewer, b);
  assert.equal(saved.state, "released");
  assert.equal((await registry.history(f.reviewer, saved.id)).items.length, 1);
});
test("separate SQLite connections accept only one final decision and reject stale competing decision", async (t) => {
  const f = await sqlFixture(t),
    r = new PreviewSqliteRepository(f.file);
  try {
    const results = await Promise.allSettled([
      new ReviewRegistry(f.repo).decide(f.reviewer, decisionBody(f.l)),
      new ReviewRegistry(r).decide(
        { ...f.reviewer, actorId: randomUUID() },
        decisionBody(f.l, { decision: "reject" }),
      ),
    ]);
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(
      results.find((x) => x.status === "rejected").reason.code,
      "CONFLICT",
    );
  } finally {
    r.close();
  }
});
test("fictional review prerequisite setup is idempotent, CSRF-protected and atomic with no reviewer impersonation", async (t) => {
  const f = await httpFixture(t);
  await f.login("reviewer");
  const key = randomUUID();
  assert.equal(
    (
      await f.call(
        "/preview/review-example",
        { requestId: key },
        { "x-sterile-csrf": "" },
      )
    ).status,
    403,
  );
  const l = await (
    await f.call("/preview/review-example", { requestId: key })
  ).json();
  assert.notEqual(l.finishedBy, f.session.actorId);
  assert.deepEqual(
    await (await f.call("/preview/review-example", { requestId: key })).json(),
    l,
  );
  assert.equal(
    (await (await f.call(f.base + "/instruments/" + f.i.id)).json())
      .activeAssembly,
    undefined,
  );
  const g = await sqlFixture(t),
    before = await new InstrumentRegistry(g.repo).list(g.s),
    broken = {
      transaction: (s, work) =>
        g.repo.transaction(s, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("synthetic failure");
            },
          }),
        ),
    };
  await assert.rejects(g.prepareReviewExample(broken, g.s, randomUUID()));
  assert.deepEqual(await new InstrumentRegistry(g.repo).list(g.s), before);
});
