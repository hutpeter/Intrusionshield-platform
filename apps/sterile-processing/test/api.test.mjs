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
test("recall API preserves source scope/version and CSRF without allowing actor overrides", async (t) => {
  let foreign = false;
  const calls = [];
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      id: "recall",
      tenantId: foreign ? "other" : session.tenantId,
      items: [],
    });
  });
  const body = {
    requestId: "request",
    code: "RECALL-DEMO",
    sourceKind: "package",
    sourceId: "package",
    sourceVersion: 1,
    reason: "DEMO",
    reference: "DEMO",
    confirmed: true,
  };
  await api.createRecall(session, body, signal());
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.recall(session, "recall", signal(), 1);
  assert.ok(calls[1].path.endsWith("/versions/1"));
  foreign = true;
  await assert.rejects(
    api.recall(session, "recall", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});

test("returns preserve issue version, confirmations and disposition link with CSRF and scoped reads", async (t) => {
  const calls = [];
  let foreign = false;
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      id: "return",
      tenantId: foreign ? "other" : session.tenantId,
    });
  });
  const body = {
    requestId: "request",
    code: "RETURN",
    distributionId: "issue",
    distributionVersion: 2,
    condition: "used",
    location: "quarantine",
    custodian: "demo",
    reference: "demo",
    note: "",
    contentsChecked: true,
    confirmed: true,
  };
  await api.createReturn(session, body, signal());
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.disposeReturn(
    session,
    "return",
    {
      requestId: "dispose",
      version: 1,
      action: "reprocess",
      reason: "demo",
      reference: "demo",
      episodeCode: "NEW",
      confirmed: true,
    },
    signal(),
  );
  assert.ok(calls[1].path.endsWith("/returns/return/dispose"));
  await api.returned(session, "return", signal(), 1);
  assert.ok(calls[2].path.endsWith("/versions/1"));
  foreign = true;
  await assert.rejects(
    api.returned(session, "return", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});

test("traceability search escapes exact codes, uses read-only requests and rejects foreign scope", async (t) => {
  const calls = [];
  let foreign = false;
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      tenantId: foreign ? "other" : session.tenantId,
      facilityId: session.facilityId,
      matches: [],
      nodes: [],
    });
  });
  await api.traceSearch(session, "PACK A&tenantId=x", signal());
  assert.ok(calls[0].path.endsWith("?code=PACK%20A%26tenantId%3Dx"));
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.body, undefined);
  await api.traceReport(session, "package", "package", signal());
  assert.ok(calls[1].path.endsWith("/traceability/package/package"));
  foreign = true;
  await assert.rejects(
    api.traceReport(session, "package", "package", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});

test("recall impact and extension preserve scope, exact source version, confirmation hash and CSRF", async (t) => {
  const calls = [];
  let foreign = false;
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      tenantId: foreign ? "other" : session.tenantId,
      items: [],
      instruments: [],
    });
  });
  await api.recallImpact(session, "package", "package", 3, signal());
  assert.ok(
    calls[0].path.endsWith(
      "/recalls/impact?sourceKind=package&sourceId=package&sourceVersion=3",
    ),
  );
  const body = {
    requestId: "request",
    version: 1,
    impactHash: "hash",
    reason: "Extend",
    reference: "Demo",
    confirmed: true,
  };
  await api.extendRecall(session, "recall", body, signal());
  assert.deepEqual(JSON.parse(calls[1].options.body), body);
  assert.equal(calls[1].options.headers["x-sterile-csrf"], session.csrf);
  foreign = true;
  await assert.rejects(
    api.recallCaseImpact(session, "recall", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});

test("recall clearance and new admission preserve evidence, version/hash, CSRF and scoped plan reads", async (t) => {
  const calls = [];
  let foreign = false;
  fake(t, async (path, options) => {
    calls.push({ path, options });
    return response({
      ...session,
      tenantId: foreign ? "other" : session.tenantId,
    });
  });
  const body = {
    requestId: "clear",
    version: 5,
    resolution: "Demo",
    evidence: "Demo",
    procedure: "Demo",
    procedureVersion: "1",
    causeReviewed: true,
    recoveryReviewed: true,
    dispositionReviewed: true,
    reprocessingRequired: true,
    confirmed: true,
  };
  await api.clearRecall(session, "case", body, signal());
  assert.ok(calls[0].path.endsWith("/recalls/case/clear"));
  assert.deepEqual(JSON.parse(calls[0].options.body), body);
  assert.equal(calls[0].options.headers["x-sterile-csrf"], session.csrf);
  await api.admitRecall(
    session,
    "case",
    {
      requestId: "admit",
      version: 6,
      impactHash: "hash",
      episodeCode: "NEW",
      custodian: "Demo",
      location: "Demo",
      condition: "Held",
      reference: "Demo",
      note: "",
      contentsChecked: true,
      confirmed: true,
    },
    signal(),
  );
  assert.ok(calls[1].path.endsWith("/admit"));
  foreign = true;
  await assert.rejects(
    api.recallAdmissionPlan(session, "case", signal()),
    (e) => e.code === "SERVICE_UNAVAILABLE",
  );
});
test("maintenance authorization preserves evidence, version and CSRF and rejects a foreign result", async (t) => {
  const input = {
    requestId: "request",
    version: 4,
    confirmed: true,
    reason: "reviewed",
    evidence: "FUNCTION",
    procedure: "REPROCESS",
    procedureVersion: "1",
    code: "NEW-RECEIVING",
    custodian: "Receiver",
    location: "Quarantine",
    functionalChecked: true,
  };
  fake(t, async (path, options) => {
    assert.match(path, /\/instruments\/instrument\/maintenance\/authorize$/);
    assert.equal(options.headers["x-sterile-csrf"], session.csrf);
    assert.deepEqual(JSON.parse(options.body), input);
    return new Response(
      JSON.stringify({ tenantId: "foreign", facilityId: session.facilityId }),
      { status: 200 },
    );
  });
  await assert.rejects(
    api.maintenance(session, "instrument", "authorize", input, signal()),
    (e) => e instanceof ApiError && e.code === "SERVICE_UNAVAILABLE",
  );
});
test("scanner lookup encodes the complete token and rejects foreign result scope", async (t) => {
  const token = "RSP-I-123 +?";
  fake(t, async (path, options) => {
    assert.ok(
      path.endsWith("/instrument-scan?identifier=" + encodeURIComponent(token)),
    );
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    return new Response(
      JSON.stringify({
        id: "foreign",
        tenantId: "other",
        facilityId: session.facilityId,
      }),
      { status: 200 },
    );
  });
  await assert.rejects(
    api.scanInstrument(session, token, signal()),
    (e) => e instanceof ApiError && e.code === "SERVICE_UNAVAILABLE",
  );
});
test("tray scan command carries version, explicit placement confirmation and CSRF", async (t) => {
  const input = {
    requestId: "request",
    version: 3,
    identifier: "RSP-I-INSTRUMENT",
    confirmed: true,
  };
  fake(t, async (path, options) => {
    assert.ok(path.endsWith("/tray-assemblies/assembly/scan"));
    assert.equal(options.headers["x-sterile-csrf"], session.csrf);
    assert.deepEqual(JSON.parse(options.body), input);
    return new Response(
      JSON.stringify({
        tenantId: session.tenantId,
        facilityId: session.facilityId,
        id: "assembly",
        version: 4,
      }),
      { status: 200 },
    );
  });
  const r = await api.addTrayScan(session, "assembly", input, signal());
  assert.equal(r.version, 4);
});
test("scanned receiving sends selected IDs and scan provenance with explicit receipt confirmation", async (t) => {
  const input = {
    requestId: "request",
    code: "REC",
    source: "Dept",
    custodian: "Custodian",
    condition: "Used",
    discrepancies: "",
    instrumentIds: ["instrument"],
    scannedIdentifiers: ["RSP-I-INSTRUMENT"],
    confirmed: true,
  };
  fake(t, async (path, options) => {
    assert.ok(path.endsWith("/processing/scanned-receipts"));
    assert.equal(options.headers["x-sterile-csrf"], session.csrf);
    assert.deepEqual(JSON.parse(options.body), input);
    return new Response(
      JSON.stringify({
        id: "episode",
        tenantId: session.tenantId,
        facilityId: session.facilityId,
      }),
      { status: 201 },
    );
  });
  assert.equal(
    (await api.receiveScanned(session, input, signal())).id,
    "episode",
  );
});
test("load scan preserves version-bound package identifier and placement confirmation", async (t) => {
  const input = {
    requestId: "request",
    version: 2,
    identifier: "RSP-P-PACKAGE-V1",
    confirmed: true,
  };
  fake(t, async (path, options) => {
    assert.ok(path.endsWith("/loads/load/scan"));
    assert.equal(options.headers["x-sterile-csrf"], session.csrf);
    assert.deepEqual(JSON.parse(options.body), input);
    return new Response(
      JSON.stringify({
        id: "load",
        tenantId: session.tenantId,
        facilityId: session.facilityId,
        version: 3,
      }),
      { status: 200 },
    );
  });
  assert.equal(
    (await api.addLoadScan(session, "load", input, signal())).version,
    3,
  );
});
test("distribution scan rejects nested foreign scope instead of opening a movement form", async (t) => {
  fake(t, async (path, options) => {
    assert.ok(
      path.endsWith(
        "/distribution-scan?identifier=" + encodeURIComponent("RSP-P-ID-V1"),
      ),
    );
    assert.equal(options.method, "GET");
    return new Response(
      JSON.stringify({
        tenantId: session.tenantId,
        facilityId: session.facilityId,
        package: { tenantId: "foreign", facilityId: session.facilityId },
        distribution: null,
      }),
      { status: 200 },
    );
  });
  await assert.rejects(
    api.scanDistribution(session, "RSP-P-ID-V1", signal()),
    (e) => e instanceof ApiError && e.code === "SERVICE_UNAVAILABLE",
  );
});
