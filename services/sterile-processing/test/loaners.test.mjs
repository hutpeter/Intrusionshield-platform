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
  ProcessingRegistry,
  LoanerRegistry,
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
const body = (typeId, extra = {}) => ({
  requestId: randomUUID(),
  code: "LOAN-HTTP",
  supplier: "DEMO-SUPPLIER",
  supplierReference: "DEMO-SET",
  dueOn: "",
  location: "DEMO-RECEIVING",
  custodian: "DEMO-COURIER",
  reference: "DEMO-DELIVERY",
  condition: "Used",
  note: "Fictional",
  contentsChecked: true,
  confirmed: true,
  items: [
    {
      code: "LOAN-HTTP-INS",
      instrumentTypeId: typeId,
      serialNumber: "FICTITIOUS",
    },
  ],
  ...extra,
});
test("loaner receipt API checks roles, source permissions, CSRF, scope and strict declarations; auditor reads history", async (t) => {
  const f = await httpFixture(t),
    b = body(f.type.id);
  for (const role of ["reviewer", "viewer"]) {
    await f.login(role);
    assert.equal((await f.call(f.base + "/loaners", b)).status, 403);
    assert.equal(
      (await f.call("/preview/loaner-example", { requestId: randomUUID() }))
        .status,
      403,
    );
  }
  await f.login("operator");
  assert.equal(
    (await f.call(f.base + "/loaners", b, { "x-sterile-csrf": "bad" })).status,
    403,
  );
  assert.equal(
    (await f.call(f.base + "/loaners", { ...b, actorId: randomUUID() })).status,
    400,
  );
  assert.equal(
    (
      await f.call(f.base + "/loaners", {
        ...b,
        items: [{ ...b.items[0], ownerFacilityId: randomUUID() }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.call(f.base + "/loaners", { ...b, contentsChecked: false }))
      .status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base.replace(f.session.facilityId, randomUUID()) + "/loaners",
        b,
      )
    ).status,
    404,
  );
  const response = await f.call(f.base + "/loaners", b);
  assert.equal(response.status, 201);
  const r = await response.json();
  assert.equal(r.items.length, 1);
  assert.equal(r.state, "received");
  assert.equal(
    (await (await f.call(f.base + "/processing/" + r.episodeId)).json()).state,
    "received",
  );
  const i = await (
    await f.call(f.base + "/instruments/" + r.items[0].id)
  ).json();
  assert.equal(i.externalOwnership.supplier, b.supplier);
  assert.equal(i.processingHold.episodeId, r.episodeId);
  await f.login("viewer");
  assert.equal((await f.call(f.base + "/loaners/" + r.id)).status, 200);
  assert.equal(
    (await f.call(f.base + "/loaners/" + r.id + "/history")).status,
    200,
  );
  assert.equal(
    (await f.call(f.base + "/loaners/" + r.id + "/versions/1")).status,
    200,
  );
  assert.equal(
    (
      await f.call(f.base + "/loaners/" + r.id + "/return", {
        requestId: randomUUID(),
        version: 1,
        instrumentIds: r.items.map((i) => i.id),
        recipient: "Vendor",
        reference: "REF",
        note: "",
        contentsChecked: true,
        confirmed: true,
      })
    ).status,
    403,
  );
});
test("SQLite loaner ownership, receipt and hand-back versions persist; audit failure rolls back all linked records", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sterile-loaners-")),
    file = join(dir, "registry.sqlite");
  let repo = new PreviewSqliteRepository(file);
  t.after(() => {
    repo.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    },
    ir = new InstrumentRegistry(repo),
    type = await ir.createType(s, {
      requestId: randomUUID(),
      code: "TYPE",
      name: "Clamp",
      manufacturer: "Demo",
      model: "",
    }),
    b = body(type.id),
    broken = {
      transaction: (scope, work) =>
        repo.transaction(scope, (tx) =>
          work({
            ...tx,
            appendAudit: async () => {
              throw Error("audit unavailable");
            },
          }),
        ),
    };
  await assert.rejects(
    new LoanerRegistry(broken).receive(s, b),
    /audit unavailable/,
  );
  assert.equal((await ir.list(s)).items.length, 0);
  assert.equal((await new LoanerRegistry(repo).list(s)).items.length, 0);
  const r = await new LoanerRegistry(repo).receive(s, b);
  repo.close();
  repo = new PreviewSqliteRepository(file);
  assert.deepEqual(await new LoanerRegistry(repo).get(s, r.id), r);
  assert.equal(
    (await new InstrumentRegistry(repo).get(s, r.items[0].id)).externalOwnership
      .loanerId,
    r.id,
  );
  const p = new ProcessingRegistry(repo);
  await p.start(s, r.episodeId, {
    requestId: randomUUID(),
    version: 1,
    method: "manual",
    procedure: "CLEAN",
    procedureVersion: "1",
    equipment: "",
    confirmed: true,
  });
  await p.finish(s, r.episodeId, {
    requestId: randomUUID(),
    version: 2,
    outcome: "passed",
    evidence: "DEMO",
    note: "",
    confirmed: true,
  });
  await p.inspect(s, r.episodeId, {
    requestId: randomUUID(),
    version: 3,
    procedure: "INSPECT",
    procedureVersion: "1",
    evidence: "DEMO",
    confirmed: true,
    items: r.items.map((i) => ({
      instrumentId: i.id,
      clean: true,
      dry: true,
      intact: true,
      functional: true,
      note: "",
    })),
  });
  const out = {
    requestId: randomUUID(),
    version: 1,
    instrumentIds: r.items.map((i) => i.id),
    recipient: "Vendor receiver",
    reference: "HAND-BACK",
    note: "Fictional",
    contentsChecked: true,
    confirmed: true,
  };
  await assert.rejects(
    new LoanerRegistry(broken).returnToSupplier(s, r.id, out),
    /audit unavailable/,
  );
  assert.equal((await new LoanerRegistry(repo).get(s, r.id)).state, "received");
  const returned = await new LoanerRegistry(repo).returnToSupplier(
    s,
    r.id,
    out,
  );
  repo.close();
  repo = new PreviewSqliteRepository(file);
  assert.deepEqual(
    await new LoanerRegistry(repo).returnToSupplier(s, r.id, out),
    returned,
  );
  assert.equal(
    (await new LoanerRegistry(repo).get(s, r.id, 1)).state,
    "received",
  );
  assert.equal(
    (await new InstrumentRegistry(repo).get(s, r.items[0].id)).loanerStatus,
    "returned",
  );
});
test("loaner write grant alone cannot create instruments or processing holds", async (t) => {
  const { createSterileApp } = await import("../dist/app.js"),
    server = createServer(),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    };
  let transactions = 0;
  server.on(
    "request",
    createSterileApp({
      repository: {
        transaction: async () => {
          transactions++;
          throw Error("must not read or write");
        },
      },
      authenticate: async () => ({
        tenantId: s.tenantId,
        actorId: s.actorId,
        facilityIds: [s.facilityId],
      }),
      authorize: async (scope, cap, permission) =>
        permission === "loaners:write",
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(
    "http://127.0.0.1:" +
      server.address().port +
      "/api/v1/sterile/facilities/" +
      s.facilityId +
      "/loaners",
    {
      method: "POST",
      headers: {
        authorization: "Bearer demo",
        "content-type": "application/json",
      },
      body: JSON.stringify(body(randomUUID())),
    },
  );
  assert.equal(response.status, 403);
  assert.equal(transactions, 0);
});
