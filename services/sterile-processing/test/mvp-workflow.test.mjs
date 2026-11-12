// MVP closeout: normal public commands on a fresh SQLite store, no example helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
import { createSterilePreview } from "../dist/development/preview.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "sterile-mvp-")),
    file = join(dir, "registry.sqlite");
  let repo,
    preview,
    server,
    origin,
    cookie = "",
    session;
  async function boot() {
    repo = new PreviewSqliteRepository(file);
    server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = "http://127.0.0.1:" + server.address().port;
    preview = createSterilePreview({ origin, repository: repo });
    server.on("request", preview.app);
    cookie = "";
    session = undefined;
  }
  async function stop() {
    if (!server) return;
    await new Promise((resolve) => server.close(resolve));
    preview.dispose();
    repo.close();
    server = undefined;
  }
  async function call(path, body, expected = 200, headers = {}) {
    const target =
      path.startsWith("/preview/") || path === "/health"
        ? path
        : "/api/v1/sterile/facilities/" + session.facilityId + path;
    const res = await fetch(origin + target, {
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
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const data = await res.json();
    assert.equal(res.status, expected, `${target}: ${JSON.stringify(data)}`);
    return data;
  }
  async function login(role = "operator") {
    session = await call("/preview/session");
    session = await call("/preview/login", { role });
    return session;
  }
  await boot();
  await login();
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    call,
    login,
    command: (path, body, expected = 200, headers) =>
      call(path, { requestId: randomUUID(), ...body }, expected, headers),
    get session() {
      return session;
    },
    restart: async () => {
      await stop();
      await boot();
      await login();
    },
  };
}
async function preparePackage(f, suffix, { retryCleaning = false } = {}) {
  const type = await f.command(
    "/instrument-types",
    {
      code: "MVP-TYPE-" + suffix,
      name: "Fictional MVP instrument",
      manufacturer: "DEMO",
      model: "DEMO",
    },
    201,
  );
  const instrument = await f.command(
    "/instruments",
    {
      instrumentTypeId: type.id,
      code: "MVP-INS-" + suffix,
      serialNumber: "FICTITIOUS",
    },
    201,
  );
  const receipt = {
    requestId: randomUUID(),
    code: "MVP-REC-" + suffix,
    source: "SIMULATED source",
    custodian: "SIMULATED custodian",
    condition: "Fictional used instrument",
    discrepancies: "",
    instrumentIds: [instrument.id],
    confirmed: true,
  };
  let episode = await f.call("/processing", receipt, 201);
  assert.deepEqual(
    await f.call("/processing", receipt, 201),
    episode,
    "identical retries must not duplicate a receipt",
  );
  const start = {
    method: "manual",
    procedure: "SIMULATED-CLEAN",
    procedureVersion: "MVP-1",
    equipment: "",
    confirmed: true,
  };
  episode = await f.command(`/processing/${episode.id}/start`, {
    version: episode.version,
    ...start,
  });
  if (retryCleaning) {
    episode = await f.command(`/processing/${episode.id}/finish`, {
      version: episode.version,
      outcome: "failed",
      evidence: "SIMULATED failed cleaning evidence",
      note: "Fictional failed attempt retained",
      confirmed: true,
    });
    assert.equal(episode.state, "cleaning_failed");
    assert.ok((await f.call("/instruments/" + instrument.id)).processingHold);
    episode = await f.command(`/processing/${episode.id}/start`, {
      version: episode.version,
      ...start,
    });
  }
  episode = await f.command(`/processing/${episode.id}/finish`, {
    version: episode.version,
    outcome: "passed",
    evidence: "SIMULATED cleaning evidence",
    note: "Fictional only",
    confirmed: true,
  });
  assert.equal(episode.state, "awaiting_inspection");
  const definition = await f.command(
    "/tray-definitions",
    {
      code: "MVP-DEF-" + suffix,
      name: "Fictional MVP tray",
      requirements: [{ instrumentTypeId: type.id, quantity: 1 }],
    },
    201,
  );
  let assembly = await f.command(
    "/tray-assemblies",
    {
      code: "MVP-ARM-" + suffix,
      definitionId: definition.id,
      definitionVersion: definition.revision,
    },
    201,
  );
  // Receipt/cleaning alone cannot unlock instrument assignment.
  await f.command(
    `/tray-assemblies/${assembly.id}/contents`,
    { version: assembly.version, instrumentIds: [instrument.id] },
    409,
  );
  episode = await f.command(`/processing/${episode.id}/inspect`, {
    version: episode.version,
    procedure: "SIMULATED-INSPECTION",
    procedureVersion: "MVP-1",
    evidence: "SIMULATED inspection evidence",
    confirmed: true,
    items: [
      {
        instrumentId: instrument.id,
        clean: true,
        dry: true,
        intact: true,
        functional: true,
        note: "Fictional inspection; independent inspector rule remains parked",
      },
    ],
  });
  assert.equal(episode.state, "ready_for_assembly");
  assembly = await f.command(`/tray-assemblies/${assembly.id}/contents`, {
    version: assembly.version,
    instrumentIds: [instrument.id],
  });
  assembly = await f.command(`/tray-assemblies/${assembly.id}/action`, {
    version: assembly.version,
    action: "complete",
    reason: "",
    confirmed: true,
  });
  assert.equal(assembly.state, "complete");
  const pack = await f.command(
    "/packages",
    {
      code: "MVP-PACK-" + suffix,
      assemblyId: assembly.id,
      assemblyVersion: assembly.version,
      material: "SIMULATED WRAP",
      materialLot: "SIMULATED-LOT",
      procedure: "SIMULATED-PACK",
      procedureVersion: "MVP-1",
      sealChecked: true,
      contentsChecked: true,
      confirmed: true,
    },
    201,
  );
  assert.equal(pack.inspectionProofs[0].episodeId, episode.id);
  assert.equal(pack.state, "packaged");
  return { type, instrument, episode, definition, assembly, pack };
}
async function cycle(f, p, suffix, outcome = "passed") {
  let load = await f.command(
    "/loads",
    {
      code: "MVP-LOAD-" + suffix,
      sterilizer: "SIMULATED-STER",
      method: "steam",
      profile: "SIMULATED-PROFILE",
      profileVersion: "MVP-1",
      packageIds: [p.pack.id],
      confirmed: true,
    },
    201,
  );
  load = await f.command(`/loads/${load.id}/start`, {
    version: load.version,
    cycleReference: "MVP-CYCLE-" + suffix,
    confirmed: true,
  });
  load = await f.command(`/loads/${load.id}/finish`, {
    version: load.version,
    outcome,
    cycleEvidence: "SIMULATED cycle evidence",
    indicatorEvidence:
      outcome === "passed" ? "SIMULATED indicator evidence" : "",
    note:
      outcome === "passed"
        ? "Fictional only"
        : "SIMULATED failure/abort reason",
    confirmed: true,
  });
  return load;
}
const reviewBody = (load, decision = "release", reviewVersion = 0) => ({
  loadId: load.id,
  loadVersion: load.version,
  reviewVersion,
  decision,
  reason: "SIMULATED reviewer decision",
  reference: "SIMULATED-REVIEW",
  cycleChecked: true,
  indicatorsChecked: true,
  packagesChecked: true,
  profileChecked: true,
  confirmed: true,
});
test("MVP full HTTP/SQLite chain: receive, failed-cleaning retry, inspect, assemble, pack, cycle, independent cycle review, store/issue, return/reprocess and trace survives restart", async (t) => {
  const f = await fixture(t),
    p = await preparePackage(f, "SUCCESS", { retryCleaning: true }),
    load = await cycle(f, p, "SUCCESS");
  assert.equal(load.state, "awaiting_review");
  await f.command("/reviews", reviewBody(load), 403);
  await f.command(
    "/distribution",
    {
      packageId: p.pack.id,
      packageVersion: p.pack.version,
      reviewId: randomUUID(),
      reviewVersion: 1,
      location: "STORE",
      reference: "SIMULATED",
      integrityChecked: true,
      confirmed: true,
    },
    409,
  );
  await f.login("reviewer");
  const held = await f.command("/reviews", reviewBody(load, "hold"), 201);
  assert.equal(held.state, "held");
  const released = await f.command(
    "/reviews",
    reviewBody(load, "release", held.version),
    201,
  );
  assert.equal(released.state, "released");
  assert.equal(released.decisions.at(-1).actorId, f.session.actorId);
  assert.notEqual(released.decisions.at(-1).actorId, load.startedBy);
  await f.login("operator");
  let stored = await f.command(
    "/distribution",
    {
      packageId: p.pack.id,
      packageVersion: p.pack.version,
      reviewId: released.id,
      reviewVersion: released.version,
      location: "MVP-STORE-A",
      reference: "SIMULATED-STORAGE",
      integrityChecked: true,
      confirmed: true,
    },
    201,
  );
  const handover = {
    version: stored.version,
    destination: "MVP-DEPARTMENT",
    recipient: "SIMULATED-RECEIVER",
    reference: "SIMULATED-HANDOVER",
    integrityChecked: true,
    confirmed: true,
  };
  stored = await f.command(`/distribution/${stored.id}/issue`, handover);
  assert.equal(stored.state, "issued");
  await f.command(`/distribution/${stored.id}/issue`, handover, 409);
  const returned = await f.command(
    "/returns",
    {
      code: "MVP-RETURN-SUCCESS",
      distributionId: stored.id,
      distributionVersion: stored.version,
      condition: "used",
      location: "MVP-QUARANTINE",
      custodian: "SIMULATED-RETURNER",
      reference: "SIMULATED-RETURN",
      note: "Fictional complete return",
      contentsChecked: true,
      confirmed: true,
    },
    201,
  );
  assert.equal((await f.call("/reviews/" + released.id)).returnBlocked, true);
  await f.login("reviewer");
  const disposed = await f.command(`/returns/${returned.id}/dispose`, {
    version: returned.version,
    action: "reprocess",
    reason: "SIMULATED fresh receiving required",
    reference: "SIMULATED-REPROCESS",
    episodeCode: "MVP-READMISSION",
    confirmed: true,
  });
  const fresh = await f.call("/processing/" + disposed.episodeId);
  assert.equal(fresh.state, "received");
  assert.equal(fresh.attempts.length, 0);
  assert.equal(fresh.inspections.length, 0);
  const trace = await f.call("/traceability/package/" + p.pack.id);
  for (const id of [
    p.episode.id,
    p.assembly.id,
    p.pack.id,
    load.id,
    released.id,
    stored.id,
    returned.id,
    fresh.id,
  ])
    assert.ok(
      trace.nodes.some((n) => n.id === id),
      "missing trace node " + id,
    );
  assert.ok(trace.alerts.some((a) => a.kind === "return_block"));
  assert.ok(trace.alerts.some((a) => a.kind === "processing_hold"));
  assert.ok(trace.links.some((l) => l.relation === "original_issue"));
  await f.restart();
  const restored = await f.call("/traceability/package/" + p.pack.id);
  assert.equal(restored.nodes.length, trace.nodes.length);
  assert.equal((await f.call("/reviews/" + released.id)).state, "released");
  assert.equal(
    (await f.call("/returns/" + returned.id)).version,
    disposed.version,
  );
  assert.equal((await f.call("/processing/" + fresh.id)).state, "received");
  await f.login("viewer");
  await f.call("/traceability/package/" + p.pack.id);
  await f.command(
    "/processing",
    {
      code: "DENIED",
      source: "DEMO",
      custodian: "DEMO",
      condition: "DEMO",
      discrepancies: "",
      instrumentIds: [p.instrument.id],
      confirmed: true,
    },
    403,
  );
});
test("MVP failed/aborted cycle gates and recall recovery keep packages blocked after restart", async (t) => {
  const f = await fixture(t);
  for (const outcome of ["failed", "aborted"]) {
    await f.login("operator");
    const p = await preparePackage(f, outcome.toUpperCase()),
      load = await cycle(f, p, outcome.toUpperCase(), outcome);
    assert.equal(load.state, outcome);
    await f.login("reviewer");
    await f.command("/reviews", reviewBody(load), 409);
    const rejected = await f.command(
      "/reviews",
      reviewBody(load, "reject"),
      201,
    );
    assert.equal(rejected.state, "rejected");
    await f.login("operator");
    await f.command(
      "/distribution",
      {
        packageId: p.pack.id,
        packageVersion: p.pack.version,
        reviewId: rejected.id,
        reviewVersion: rejected.version,
        location: "STORE",
        reference: "SIMULATED",
        integrityChecked: true,
        confirmed: true,
      },
      409,
    );
  }
  await f.login("operator");
  const p = await preparePackage(f, "RECALL"),
    load = await cycle(f, p, "RECALL");
  await f.login("reviewer");
  const released = await f.command("/reviews", reviewBody(load), 201);
  await f.login("operator");
  const stored = await f.command(
    "/distribution",
    {
      packageId: p.pack.id,
      packageVersion: p.pack.version,
      reviewId: released.id,
      reviewVersion: released.version,
      location: "MVP-STORE-A",
      reference: "SIMULATED-STORAGE",
      integrityChecked: true,
      confirmed: true,
    },
    201,
  );
  await f.login("reviewer");
  let recall = await f.command(
    "/recalls",
    {
      code: "MVP-RECALL",
      sourceKind: "package",
      sourceId: p.pack.id,
      sourceVersion: p.pack.version,
      reason: "SIMULATED incident",
      reference: "SIMULATED-INCIDENT",
      confirmed: true,
    },
    201,
  );
  await f.login("operator");
  await f.command(
    `/distribution/${stored.id}/issue`,
    {
      version: stored.version,
      destination: "DEMO",
      recipient: "DEMO",
      reference: "SIMULATED",
      integrityChecked: true,
      confirmed: true,
    },
    409,
  );
  recall = await f.command(`/recalls/${recall.id}/recover`, {
    version: recall.version,
    packageId: p.pack.id,
    location: "MVP-RECALL-QUARANTINE",
    reference: "SIMULATED-RECOVERY",
    note: "Fictional recovery",
    confirmed: true,
  });
  await f.login("reviewer");
  recall = await f.command(`/recalls/${recall.id}/dispose`, {
    version: recall.version,
    packageId: p.pack.id,
    action: "quarantine",
    reason: "SIMULATED disposition",
    reference: "SIMULATED-DISPOSITION",
    confirmed: true,
  });
  assert.equal(recall.state, "closed");
  await f.restart();
  assert.equal((await f.call("/reviews/" + released.id)).state, "released");
  assert.equal((await f.call("/reviews/" + released.id)).recallBlocked, true);
  assert.equal((await f.call("/recalls/" + recall.id)).state, "closed");
  await f.command(
    `/distribution/${stored.id}/issue`,
    {
      version: stored.version,
      destination: "DEMO",
      recipient: "DEMO",
      reference: "SIMULATED",
      integrityChecked: true,
      confirmed: true,
    },
    409,
  );
});
