import { test } from "node:test";
import assert from "node:assert/strict";
import { api, call, ApiError } from "../src/api.ts";
import { texts } from "../src/text.ts";
const session = {
  mode: "local-dummy-preview",
  authenticated: true,
  csrf: "a".repeat(64),
  expiresAt: Date.now() + 30000,
  tenantId: "tenant",
  facilityId: "facility",
  actorId: "actor",
  role: "operator",
  canWrite: true,
};
const signal = () => new AbortController().signal;
function fake(t, fn) {
  const old = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => (globalThis.fetch = old));
}
const response = (value) => new Response(JSON.stringify(value));
test("uses cookie credentials and no-store, attaches CSRF only to writes, and never supplies bearer tokens", async (t) => {
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response(session);
  });
  await api.session(signal());
  await api.login("operator", session, signal());
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.headers.authorization, undefined);
  assert.equal(calls[1].options.headers["x-sterile-csrf"], session.csrf);
  assert.equal(calls[1].options.headers.authorization, undefined);
});
test("rejects malformed or oversized lists and cross-tenant/facility response data", async (t) => {
  let value = { items: [], page: 1, hasMore: false };
  fake(t, async () => response(value));
  for (const bad of [
    { items: [], page: 2, hasMore: false },
    { items: Array(51).fill({}), page: 1, hasMore: false },
    {
      items: [{ tenantId: "foreign", facilityId: "facility" }],
      page: 1,
      hasMore: false,
    },
    {
      items: [{ tenantId: "tenant", facilityId: "foreign" }],
      page: 1,
      hasMore: false,
    },
  ]) {
    value = bad;
    await assert.rejects(api.instruments(session, 1, signal()), {
      status: 503,
    });
  }
  value = { items: [], page: 1, hasMore: false };
  assert.equal((await api.instruments(session, 1, signal())).items.length, 0);
});
test("preserves explicit error codes without exposing arbitrary server text and supports cancellation", async (t) => {
  fake(
    t,
    async () =>
      new Response(JSON.stringify({ error: "CONFLICT", details: "PRIVATE" }), {
        status: 409,
      }),
  );
  await assert.rejects(
    call("/api/v1/sterile/test", signal()),
    (e) =>
      e instanceof ApiError &&
      e.status === 409 &&
      e.code === "CONFLICT" &&
      !e.message.includes("PRIVATE"),
  );
  fake(t, async () => new Response("private stack", { status: 503 }));
  await assert.rejects(call("/api/v1/sterile/test", signal()), {
    code: "SERVICE_UNAVAILABLE",
  });
  fake(t, async (_path, options) => {
    options.signal.throwIfAborted();
    return response({});
  });
  const c = new AbortController();
  c.abort();
  await assert.rejects(call("/preview/session", c.signal), {
    name: "AbortError",
  });
});
test("validates session metadata and provides complete Spanish, English and French screen labels", async (t) => {
  fake(t, async () => response({ ...session, mode: "untrusted" }));
  await assert.rejects(api.session(signal()), { status: 503 });
  const keys = Object.keys(texts.es).sort();
  for (const locale of Object.values(texts)) {
    assert.deepEqual(Object.keys(locale).sort(), keys);
    assert.ok(
      Object.values(locale).every((v) => typeof v === "string" && v.trim()),
    );
  }
});
test("tray API checks assembly scope and preserves explicit versions and confirmations", async (t) => {
  const calls = [];
  let value = {
    assembly: { id: "assembly", tenantId: "tenant", facilityId: "facility" },
    assessment: { rows: [], complete: false },
  };
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response(value);
  });
  assert.equal(
    (await api.assembly(session, "assembly", signal())).assembly.id,
    "assembly",
  );
  value = { ...value, assembly: { ...value.assembly, tenantId: "foreign" } };
  await assert.rejects(api.assembly(session, "assembly", signal()), {
    status: 503,
  });
  value = { id: "assembly", tenantId: "tenant", facilityId: "facility" };
  const command = {
    requestId: "stable-operation",
    version: 3,
    action: "disassemble",
    confirmed: true,
    reason: "Test",
  };
  await api.assemblyAction(session, "assembly", command, signal());
  const sent = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(sent, command);
  assert.equal(calls.at(-1).options.headers["x-sterile-csrf"], session.csrf);
});
test("tray lists reject cross-facility definitions and preserve snapshot revision queries", async (t) => {
  let value = {
    items: [{ id: "definition", tenantId: "tenant", facilityId: "foreign" }],
    page: 1,
    hasMore: false,
  };
  const paths = [];
  fake(t, async (path) => {
    paths.push(path);
    return response(value);
  });
  await assert.rejects(api.definitions(session, 1, signal()), { status: 503 });
  value = {
    id: "definition",
    tenantId: "tenant",
    facilityId: "facility",
    revision: 1,
  };
  await api.definition(session, "definition", signal(), 1);
  assert.ok(paths.at(-1).endsWith("/revisions/1"));
});
test("processing API preserves versions, confirmation, evidence and scoped response checks", async (t) => {
  const calls = [];
  let foreign = false;
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      tenantId: foreign ? "other" : session.tenantId,
      id: "episode",
      code: "REC",
      state: "received",
    });
  });
  const body = {
    requestId: "request",
    version: 2,
    outcome: "failed",
    evidence: "TEST-EVIDENCE",
    note: "Test residue",
    confirmed: true,
  };
  await api.finishCleaning(session, "episode", body, signal());
  assert.equal(
    calls[0].path,
    "/api/v1/sterile/facilities/facility/processing/episode/finish",
  );
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.episode(session, "episode", signal(), 1);
  assert.ok(calls[1].path.endsWith("/versions/1"));
  foreign = true;
  await assert.rejects(
    api.episode(session, "episode", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});
test("inspection API sends individual results, expected version, confirmation and CSRF", async (t) => {
  const body = {
    requestId: "request",
    version: 3,
    procedure: "DEMO",
    procedureVersion: "1",
    evidence: "DEMO",
    items: [
      {
        instrumentId: "instrument",
        clean: true,
        dry: true,
        intact: true,
        functional: true,
        note: "",
      },
    ],
    confirmed: true,
  };
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({ ...session, id: "episode" });
  });
  await api.inspectEpisode(session, "episode", body, signal());
  assert.ok(calls[0].path.endsWith("/processing/episode/inspect"));
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
});
test("package API validates nested assembly scope, preserves versioned fields and sends CSRF", async (t) => {
  let foreign = false;
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      id: "package",
      assemblyId: "assembly",
      assemblyVersion: 3,
      assemblySnapshot: {
        ...session,
        id: "assembly",
        version: 3,
        facilityId: foreign ? "other" : session.facilityId,
      },
      inspectionProofs: [],
    });
  });
  const body = {
    requestId: "request",
    code: "PACK",
    assemblyId: "assembly",
    assemblyVersion: 3,
    material: "DEMO",
    materialLot: "LOT",
    procedure: "PACK-DEMO",
    procedureVersion: "1",
    sealChecked: true,
    contentsChecked: true,
    confirmed: true,
  };
  await api.pack(session, body, signal());
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.package(session, "package", signal(), 1);
  assert.ok(calls[1].path.endsWith("/versions/1"));
  foreign = true;
  await assert.rejects(
    api.package(session, "package", signal()),
    (x) => x.code === "SERVICE_UNAVAILABLE",
  );
});
test("cycle API preserves evidence and expected version with CSRF and rejects foreign scope", async (t) => {
  let foreign = false;
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      facilityId: foreign ? "other" : session.facilityId,
      id: "load",
      state: "awaiting_review",
    });
  });
  const body = {
    requestId: "request",
    version: 2,
    outcome: "passed",
    cycleEvidence: "CYCLE-DEMO",
    indicatorEvidence: "INDICATOR-DEMO",
    note: "",
    confirmed: true,
  };
  await api.finishCycle(session, "load", body, signal());
  assert.ok(calls[0].path.endsWith("/loads/load/finish"));
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.load(session, "load", signal(), 1);
  assert.ok(calls[1].path.endsWith("/versions/1"));
  foreign = true;
  await assert.rejects(
    api.load(session, "load", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});
test("reviewer session remains separate from operator writes and requires its review capability", async (t) => {
  let valid = true;
  fake(t, async () =>
    response({
      ...session,
      role: "reviewer",
      canWrite: false,
      canReview: valid,
    }),
  );
  const r = await api.login("reviewer", session, signal());
  assert.equal(r.canReview, true);
  assert.equal(r.canWrite, false);
  valid = false;
  await assert.rejects(
    api.session(signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});
test("review API preserves checked evidence and versions and rejects a foreign frozen load snapshot", async (t) => {
  let foreign = false;
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      id: "review",
      loadId: "load",
      loadVersion: 3,
      loadSnapshot: {
        ...session,
        id: "load",
        version: 3,
        tenantId: foreign ? "other" : session.tenantId,
      },
      decisions: [],
    });
  });
  const body = {
    requestId: "request",
    loadId: "load",
    loadVersion: 3,
    reviewVersion: 0,
    decision: "release",
    reason: "DEMO",
    reference: "DEMO",
    cycleChecked: true,
    indicatorsChecked: true,
    packagesChecked: true,
    profileChecked: true,
    confirmed: true,
  };
  await api.decideReview(session, body, signal());
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.review(session, "review", signal(), 1);
  assert.ok(calls[1].path.endsWith("/versions/1"));
  foreign = true;
  await assert.rejects(
    api.review(session, "review", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});
test("distribution API preserves handover version and confirmation, sends CSRF and validates scoped history", async (t) => {
  let foreign = false;
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      id: "movement",
      facilityId: foreign ? "other" : session.facilityId,
      events: [{ number: 1 }],
    });
  });
  const body = {
    requestId: "request",
    version: 1,
    destination: "DEMO",
    recipient: "DEMO",
    reference: "HANDOVER",
    integrityChecked: true,
    confirmed: true,
  };
  await api.issuePackage(session, "movement", body, signal());
  assert.ok(calls[0].path.endsWith("/distribution/movement/issue"));
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.movement(session, "movement", signal(), 1);
  assert.ok(calls[1].path.endsWith("/versions/1"));
  foreign = true;
  await assert.rejects(
    api.movement(session, "movement", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});
