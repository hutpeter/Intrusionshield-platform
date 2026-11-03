import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  InstrumentRegistry,
  TrayRegistry,
} from "@intrusionshield/sterile-processing";
import { PreviewSqliteRepository } from "../dist/development/sqlite.js";
import { createSterilePreview } from "../dist/development/preview.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_PREVIEW = "true";
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "sterile-trays-")),
    file = join(dir, "registry.sqlite"),
    repository = new PreviewSqliteRepository(file),
    instruments = new InstrumentRegistry(repository),
    trays = new TrayRegistry(repository),
    s = {
      tenantId: randomUUID(),
      facilityId: randomUUID(),
      actorId: randomUUID(),
    };
  let closed = false;
  t.after(() => {
    if (!closed) repository.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const type = await instruments.createType(s, {
      requestId: randomUUID(),
      code: "CLAMP",
      name: "Pinza",
      manufacturer: "",
      model: "",
    }),
    i = await instruments.register(s, {
      requestId: randomUUID(),
      instrumentTypeId: type.id,
      code: "INS-001",
      serialNumber: "001",
    }),
    d = await trays.createDefinition(s, {
      requestId: randomUUID(),
      code: "DEF-001",
      name: "Bandeja",
      requirements: [{ instrumentTypeId: type.id, quantity: 1 }],
    }),
    a = await trays.createAssembly(s, {
      requestId: randomUUID(),
      code: "ASM-001",
      definitionId: d.id,
      definitionVersion: d.version,
    });
  return {
    dir,
    file,
    repository,
    instruments,
    trays,
    s,
    type,
    i,
    d,
    a,
    close() {
      repository.close();
      closed = true;
    },
  };
}
const cmd = (a, extra) => ({
  requestId: randomUUID(),
  version: a.version,
  ...extra,
});
test("persists frozen definition revisions, assembly versions, active assignments and audit across reopening", async (t) => {
  const f = await fixture(t);
  let a = await f.trays.updateContents(
    f.s,
    f.a.id,
    cmd(f.a, { instrumentIds: [f.i.id] }),
  );
  a = await f.trays.transition(
    f.s,
    a.id,
    cmd(a, { action: "complete", confirmed: true, reason: "" }),
  );
  await f.trays.reviseDefinition(f.s, f.d.id, {
    requestId: randomUUID(),
    version: 1,
    name: "Changed definition",
    reason: "New composition",
    requirements: [{ instrumentTypeId: f.type.id, quantity: 2 }],
  });
  f.close();
  const r = new PreviewSqliteRepository(f.file);
  try {
    const trays = new TrayRegistry(r),
      instruments = new InstrumentRegistry(r);
    const current = await trays.assembly(f.s, a.id);
    assert.equal(current.assembly.state, "complete");
    assert.equal(current.assembly.definitionSnapshot.name, "Bandeja");
    assert.equal(
      current.assembly.definitionSnapshot.requirements[0].quantity,
      1,
    );
    assert.equal((await trays.definition(f.s, f.d.id)).revision, 2);
    assert.equal(
      (await trays.definition(f.s, f.d.id, 1)).requirements[0].quantity,
      1,
    );
    assert.equal(
      (await instruments.get(f.s, f.i.id)).activeAssembly.assemblyId,
      a.id,
    );
    assert.equal(
      (await trays.assembly(f.s, a.id, 1)).assembly.instruments.length,
      0,
    );
    assert.equal((await trays.history(f.s, a.id, "assembly")).items.length, 3);
  } finally {
    r.close();
  }
});
test("disassembly releases reservation but preserves historical contents and transaction rollback restores reservation", async (t) => {
  const f = await fixture(t);
  let a = await f.trays.updateContents(
    f.s,
    f.a.id,
    cmd(f.a, { instrumentIds: [f.i.id] }),
  );
  const db = new DatabaseSync(f.file);
  try {
    db.exec(
      "CREATE TRIGGER reject_tray_audit BEFORE INSERT ON sp_audit WHEN json_extract(NEW.payload,'$.action') LIKE 'tray-%' BEGIN SELECT RAISE(ABORT,'synthetic tray audit failure'); END;",
    );
    const close = cmd(a, {
      action: "disassemble",
      confirmed: true,
      reason: "Prepare another set",
    });
    await assert.rejects(
      f.trays.transition(f.s, a.id, close),
      /synthetic tray audit/,
    );
    assert.equal(
      (await f.instruments.get(f.s, f.i.id)).activeAssembly.assemblyId,
      a.id,
    );
    assert.equal(
      (await f.trays.assembly(f.s, a.id)).assembly.version,
      a.version,
    );
    db.exec("DROP TRIGGER reject_tray_audit");
    const closed = await f.trays.transition(f.s, a.id, close);
    assert.equal(closed.instruments[0].id, f.i.id);
    assert.equal(
      (await f.instruments.get(f.s, f.i.id)).activeAssembly,
      undefined,
    );
    assert.equal(
      (await f.trays.assembly(f.s, a.id, a.version)).assembly.state,
      "draft",
    );
  } finally {
    db.close();
  }
});
test("rejects a second connection claimant and stale updates without changing existing membership", async (t) => {
  const f = await fixture(t),
    r = new PreviewSqliteRepository(f.file);
  try {
    const other = new TrayRegistry(r);
    const a2 = await other.createAssembly(f.s, {
      requestId: randomUUID(),
      code: "ASM-2",
      definitionId: f.d.id,
      definitionVersion: 1,
    });
    const a = await f.trays.updateContents(
      f.s,
      f.a.id,
      cmd(f.a, { instrumentIds: [f.i.id] }),
    );
    await assert.rejects(
      other.updateContents(f.s, a2.id, cmd(a2, { instrumentIds: [f.i.id] })),
      { code: "INSTRUMENT_ASSIGNED" },
    );
    await assert.rejects(
      other.updateContents(f.s, a.id, cmd(f.a, { instrumentIds: [] })),
      { code: "CONFLICT" },
    );
    assert.equal(
      (await other.assembly(f.s, a2.id)).assembly.instruments.length,
      0,
    );
    assert.equal(
      (await other.assembly(f.s, a.id)).assembly.instruments[0].id,
      f.i.id,
    );
  } finally {
    r.close();
  }
});
test("retains existing instrument rows when adding tray tables to an older preview database", async (t) => {
  const f = await fixture(t),
    original = await f.instruments.get(f.s, f.i.id);
  f.close();
  const db = new DatabaseSync(f.file);
  try {
    db.exec(
      "PRAGMA foreign_keys=OFF; DROP TABLE sp_assignments; DROP TABLE sp_assembly_versions; DROP TABLE sp_assemblies; DROP TABLE sp_definition_versions; DROP TABLE sp_definitions;",
    );
  } finally {
    db.close();
  }
  const r = new PreviewSqliteRepository(f.file);
  try {
    assert.deepEqual(
      await new InstrumentRegistry(r).get(f.s, f.i.id),
      original,
    );
    assert.equal((await new TrayRegistry(r).definitions(f.s)).items.length, 0);
  } finally {
    r.close();
  }
});
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
test("supports the reviewed HTTP workflow with exact missing counts, history and retirement protection", async (t) => {
  const f = await httpFixture(t),
    body = {
      requestId: randomUUID(),
      code: "DEF-1",
      name: "Bandeja",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 1 }],
    };
  let r = await f.call(f.base + "/tray-definitions", body);
  assert.equal(r.status, 201);
  const d = await r.json();
  r = await f.call(f.base + "/tray-assemblies", {
    requestId: randomUUID(),
    code: "ASM-1",
    definitionId: d.id,
    definitionVersion: d.version,
  });
  assert.equal(r.status, 201);
  let a = await r.json();
  assert.equal(
    (await (await f.call(f.base + "/tray-assemblies/" + a.id)).json())
      .assessment.missing,
    1,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/tray-assemblies/" + a.id + "/action",
        cmd(a, { action: "complete", confirmed: true, reason: "" }),
      )
    ).status,
    409,
  );
  r = await f.call(
    f.base + "/tray-assemblies/" + a.id + "/contents",
    cmd(a, { instrumentIds: [f.i.id] }),
  );
  assert.equal(r.status, 200);
  a = await r.json();
  assert.equal(
    (
      await f.call(f.base + "/instruments/" + f.i.id + "/retire", {
        requestId: randomUUID(),
        version: 1,
        reason: "Assigned",
      })
    ).status,
    409,
  );
  r = await f.call(
    f.base + "/tray-assemblies/" + a.id + "/action",
    cmd(a, { action: "complete", confirmed: true, reason: "" }),
  );
  assert.equal(r.status, 200);
  a = await r.json();
  assert.equal(a.state, "complete");
  assert.equal(
    (
      await (
        await f.call(f.base + "/tray-assemblies/" + a.id + "/versions/1")
      ).json()
    ).assembly.instruments.length,
    0,
  );
  assert.equal(
    (
      await (
        await f.call(f.base + "/tray-assemblies/" + a.id + "/history")
      ).json()
    ).items.length,
    3,
  );
});
test("requires explicit composition inputs and rejects forged scope, nested fields and unconfirmed transitions", async (t) => {
  const f = await httpFixture(t),
    body = {
      requestId: randomUUID(),
      code: "DEF-1",
      name: "Bandeja",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 1 }],
    };
  for (const change of [
    { tenantId: randomUUID() },
    { actorId: randomUUID() },
    {
      requirements: [
        { instrumentTypeId: f.type.id, quantity: 1, name: "Forged" },
      ],
    },
    { requirements: [{ instrumentTypeId: f.type.id, quantity: "1" }] },
  ])
    assert.equal(
      (await f.call(f.base + "/tray-definitions", { ...body, ...change }))
        .status,
      400,
    );
  assert.equal(
    (await f.call(f.base + "/tray-definitions", body, { "x-sterile-csrf": "" }))
      .status,
    403,
  );
  const d = await (await f.call(f.base + "/tray-definitions", body)).json();
  const a = await (
    await f.call(f.base + "/tray-assemblies", {
      requestId: randomUUID(),
      code: "ASM-1",
      definitionId: d.id,
      definitionVersion: 1,
    })
  ).json();
  assert.equal(
    (
      await f.call(
        f.base + "/tray-assemblies/" + a.id + "/action",
        cmd(a, { action: "disassemble", confirmed: false, reason: "Test" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/tray-assemblies/" + a.id + "/contents",
        cmd(a, { instrumentIds: Array(1001).fill(f.i.id) }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.call(
        f.base + "/tray-assemblies/" + a.id + "/contents",
        cmd(a, { instrumentIds: [f.i.id], state: "complete" }),
      )
    ).status,
    400,
  );
});
test("auditor can read frozen versions but server denies all tray mutations", async (t) => {
  const f = await httpFixture(t),
    body = {
      requestId: randomUUID(),
      code: "DEF-1",
      name: "Bandeja",
      requirements: [{ instrumentTypeId: f.type.id, quantity: 1 }],
    };
  const d = await (await f.call(f.base + "/tray-definitions", body)).json();
  const a = await (
    await f.call(f.base + "/tray-assemblies", {
      requestId: randomUUID(),
      code: "ASM-1",
      definitionId: d.id,
      definitionVersion: 1,
    })
  ).json();
  await f.call("/preview/logout", {});
  await f.login("viewer");
  for (const path of [
    "/tray-definitions",
    "/tray-definitions/" + d.id + "/revisions/1",
    "/tray-assemblies",
    "/tray-assemblies/" + a.id + "/versions/1",
    "/tray-assemblies/" + a.id + "/history",
  ])
    assert.equal((await f.call(f.base + path)).status, 200);
  for (const [path, input] of [
    ["/tray-definitions", { ...body, requestId: randomUUID() }],
    [
      "/tray-definitions/" + d.id + "/revise",
      {
        requestId: randomUUID(),
        version: 1,
        name: "Changed",
        requirements: body.requirements,
        reason: "Denied",
      },
    ],
    [
      "/tray-assemblies",
      {
        requestId: randomUUID(),
        code: "ASM-2",
        definitionId: d.id,
        definitionVersion: 1,
      },
    ],
    [
      "/tray-assemblies/" + a.id + "/contents",
      cmd(a, { instrumentIds: [f.i.id] }),
    ],
    [
      "/tray-assemblies/" + a.id + "/action",
      cmd(a, { action: "disassemble", confirmed: true, reason: "Denied" }),
    ],
  ])
    assert.equal((await f.call(f.base + path, input)).status, 403);
  assert.equal(
    (
      await f.call(
        "/api/v1/sterile/facilities/" +
          randomUUID() +
          "/tray-assemblies/" +
          a.id,
      )
    ).status,
    404,
  );
});
