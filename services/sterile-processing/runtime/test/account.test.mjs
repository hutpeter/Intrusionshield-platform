import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { request } from "node:https";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { PasswordHasher } from "@intrusionshield/authentication-service/dist/security/PasswordHasher.js";
import { loadAccountConfiguration } from "../config.mjs";
import { startAccountRuntime, readOnlyIdentityDatabase } from "../account.mjs";
import { SqliteSterileAccessDirectory } from "../../dist/security/sqlite-access.js";
import { LocalSqliteSterileRepository } from "../../dist/persistence/sqlite.js";
process.env.NODE_ENV = "development";
process.env.RUBY_STERILE_ACCOUNT_ENABLED = "true";
delete process.env.RUBY_STERILE_PREVIEW;
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ruby-account-runtime-"));
  let runtime;
  t.after(async () => {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  });
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-subj",
      "/CN=localhost",
      "-days",
      "1",
    ],
    { stdio: "ignore" },
  );
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  writeFileSync(join(dir, "password.secret"), "fictional-db-password", {
    mode: 0o600,
  });
  writeFileSync(join(dir, "token.secret"), randomBytes(48).toString("hex"), {
    mode: 0o600,
  });
  const tenantId = randomUUID(),
    actorId = randomUUID(),
    facilityId = randomUUID();
  const input = {
    origin: "https://127.0.0.1:" + port,
    tenantId,
    facilityId,
    facilityName: "Fictional runtime facility",
    timeZone: "UTC",
    workflowFile: join(dir, "workflow.sqlite"),
    accessFile: join(dir, "access.sqlite"),
    tls: {
      certificateFile: join(dir, "cert.pem"),
      privateKeyFile: join(dir, "key.pem"),
    },
    identityDatabase: {
      server: "identity.invalid",
      port: 1433,
      database: "FictionalIdentity",
      user: "fictional-read-only",
      passwordFile: join(dir, "password.secret"),
    },
    tokens: {
      issuer: "ruby-runtime-test",
      audience: "sterile-runtime-test",
      secretFile: join(dir, "token.secret"),
      lifetimeSeconds: 3600,
    },
  };
  const file = join(dir, "account.json");
  const save = (v = input) => writeFileSync(file, JSON.stringify(v));
  save();
  const passwordHash = await new PasswordHasher().hash(
    "Fictional-user-password",
  );
  const queries = [];
  let state = "ACTIVE",
    connected = 0,
    disconnected = 0;
  const database = {
    connect: async () => {
      connected++;
    },
    disconnect: async () => {
      disconnected++;
    },
    query: async (sql, params) => {
      assert.match(sql.trim(), /^SELECT\b/i);
      queries.push({ sql, params });
      const values = Object.fromEntries(
        (params ?? []).map((p) => [p.name, p.value]),
      );
      assert.equal(values.tenantId, tenantId);
      if (sql.includes("[Authentication].[Credentials]"))
        return {
          rows:
            values.username?.toUpperCase() === "PERSON"
              ? [
                  {
                    identityId: actorId,
                    tenantId,
                    identityType: "USER",
                    status: state,
                    displayName: "Fictional Ruby Person",
                    username: "person",
                    email: "person@example.invalid",
                    passwordHash,
                    preferredLanguage: "en",
                  },
                ]
              : [],
          rowCount: 1,
        };
      if (sql.includes("FROM [Identity].[Identities]")) {
        assert.equal(values.id, actorId);
        return {
          rows: [
            {
              id: actorId,
              tenantId,
              type: "USER",
              status: state,
              displayName: "Fictional Ruby Person",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          rowCount: 1,
        };
      }
      if (sql.includes("EIS.TenantConfigurations"))
        return { rows: [], rowCount: 0 };
      throw new Error("Unexpected identity query");
    },
    execute: async () => {
      throw new Error("SQL writes forbidden");
    },
  };
  function enroll() {
    const access = new SqliteSterileAccessDirectory(input.accessFile);
    try {
      return access.replaceAccess(
        {
          tenantId,
          actorId,
          status: "ACTIVE",
          facilities: [
            {
              facilityId,
              capabilityEnabled: true,
              permissions: [
                "instruments:read",
                "instruments:write",
                "dashboard:read",
              ],
            },
          ],
        },
        {
          expectedVersion: 0,
          changedBy: randomUUID(),
          reason: "Fictional authorized setup",
        },
      );
    } finally {
      access.close();
    }
  }
  let cookie = "",
    session;
  async function start() {
    runtime = await startAccountRuntime(file, {
      databaseFactory: () => database,
    });
    return runtime;
  }
  async function stop() {
    await runtime?.stop();
    runtime = undefined;
  }
  async function call(path, body, headers = {}, useCookie = cookie) {
    return await new Promise((resolve, reject) => {
      const req = request(
        input.origin + path,
        {
          rejectUnauthorized: false,
          agent: false,
          method: body === undefined ? "GET" : "POST",
          headers: {
            ...(useCookie ? { cookie: useCookie } : {}),
            ...(body === undefined
              ? {}
              : {
                  origin: input.origin,
                  "content-type": "application/json",
                  "x-sterile-csrf": session?.csrf ?? "",
                }),
            ...headers,
          },
        },
        (res) => {
          let text = "";
          res.on("data", (x) => (text += x));
          res.on("end", () => {
            if (res.headers["set-cookie"])
              cookie = res.headers["set-cookie"][0].split(";")[0];
            resolve({
              status: res.statusCode,
              text,
              headers: res.headers,
              json: () => JSON.parse(text),
            });
          });
        },
      );
      req.on("error", reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  }
  async function boot() {
    const r = await call("/auth/session");
    assert.equal(r.status, 200);
    session = r.json();
    return session;
  }
  async function login(password = "Fictional-user-password") {
    const r = await call("/auth/login", { username: "person", password });
    if (r.status === 200) session = r.json();
    return r;
  }
  return {
    dir,
    file,
    input,
    save,
    start,
    stop,
    call,
    boot,
    login,
    enroll,
    database,
    queries,
    get session() {
      return session;
    },
    get cookie() {
      return cookie;
    },
    get connected() {
      return connected;
    },
    get disconnected() {
      return disconnected;
    },
    disable() {
      state = "SUSPENDED";
    },
  };
}
test("explicit TLS runtime uses real Ruby password/token classes and read-only identity queries, persists workflow, and signs out on restart", async (t) => {
  const f = await fixture(t);
  f.enroll();
  await f.start();
  assert.equal(f.connected, 1);
  const html = await f.call("/");
  assert.equal(html.status, 200);
  assert.match(html.text, /ruby-sterile-auth/);
  await f.boot();
  assert.equal((await f.login("wrong-password")).status, 401);
  assert.equal((await f.login()).status, 200);
  assert.equal(f.session.displayName, "Fictional Ruby Person");
  assert.equal(f.session.accessToken, undefined);
  const base = "/api/v1/sterile/facilities/" + f.input.facilityId;
  assert.equal(
    (
      await f.call(base + "/instrument-types", {
        requestId: randomUUID(),
        code: "RUNTIME-TYPE",
        name: "Fictional",
        manufacturer: "",
        model: "",
      })
    ).status,
    201,
  );
  const oldCookie = f.cookie;
  await f.stop();
  assert.equal(f.disconnected, 1);
  await f.start();
  assert.equal(
    (await f.call(base + "/instruments", undefined, {}, oldCookie)).status,
    401,
  );
  await f.boot();
  assert.equal(f.session.authenticated, false);
  assert.equal((await f.login()).status, 200);
  const types = (await f.call(base + "/instrument-types")).json();
  assert.equal(types.items[0].code, "RUNTIME-TYPE");
  f.disable();
  assert.equal((await f.call(base + "/instrument-types")).status, 401);
  assert.ok(
    f.queries.some((q) => q.sql.includes("[Authentication].[Credentials]")),
  );
  assert.ok(f.queries.some((q) => q.sql.includes("EIS.TenantConfigurations")));
});
test("configuration check opens no stores or SQL and rejects implicit defaults, conflicting files and preview paths", async (t) => {
  const f = await fixture(t);
  const config = loadAccountConfiguration(f.file);
  assert.equal(config.identityDatabase.encrypt, true);
  assert.equal(config.identityDatabase.trustServerCertificate, false);
  assert.equal(existsSync(f.input.workflowFile), false);
  assert.equal(existsSync(f.input.accessFile), false);
  assert.equal(f.connected, 0);
  const checkScript = fileURLToPath(
    new URL("../../../../scripts/sterile-account-check.mjs", import.meta.url),
  );
  const checked = spawnSync(
    process.execPath,
    [checkScript, "--config", f.file],
    { encoding: "utf8" },
  );
  assert.equal(checked.status, 0);
  assert.match(checked.stdout, /No identity connection/);

  writeFileSync(
    join(f.dir, "password.secret"),
    "\uFEFFfictional-db-password\r\n",
    { mode: 0o600 },
  );
  assert.equal(
    loadAccountConfiguration(f.file).identityDatabase.password,
    "fictional-db-password",
  );
  for (const change of [
    { origin: "http://127.0.0.1:9554" },
    { origin: "https://127.0.0.1:9553" },
    { origin: "https://public.example:9554" },
    { workflowFile: "relative.sqlite" },
    { accessFile: f.input.workflowFile },
    {
      workflowFile: join(
        f.dir,
        "sterile-processing-preview",
        "registry.sqlite",
      ),
    },
    { tokens: { ...f.input.tokens, lifetimeSeconds: 0 } },
    { unexpected: "value" },
  ]) {
    f.save({ ...f.input, ...change });
    assert.throws(() => loadAccountConfiguration(f.file));
  }
  assert.equal(f.connected, 0);
  assert.equal(existsSync(f.input.workflowFile), false);
});
test("startup and local readiness guards precede the identity connection; failed connection cleans up", async (t) => {
  const f = await fixture(t);
  let factories = 0;
  process.env.RUBY_STERILE_PREVIEW = "true";
  try {
    await assert.rejects(
      () =>
        startAccountRuntime(f.file, {
          databaseFactory: () => {
            factories++;
            return f.database;
          },
        }),
      /without preview/,
    );
  } finally {
    delete process.env.RUBY_STERILE_PREVIEW;
  }
  assert.equal(factories, 0);
  await assert.rejects(
    () =>
      startAccountRuntime(f.file, {
        databaseFactory: () => {
          factories++;
          return f.database;
        },
        webRoot: join(f.dir, "missing"),
      }),
    /Build/,
  );
  assert.equal(factories, 0);
  let closed = 0;
  await assert.rejects(
    () =>
      startAccountRuntime(f.file, {
        databaseFactory: () => ({
          connect: async () => {
            throw new Error("simulated connect failure");
          },
          disconnect: async () => {
            closed++;
          },
        }),
      }),
    /simulated/,
  );
  assert.equal(closed, 1);
});
test("account and preview storage reject interchanged/renamed stores and unmarked legacy databases", async (t) => {
  const f = await fixture(t),
    account = new LocalSqliteSterileRepository(f.input.workflowFile, "account");
  account.close();
  assert.throws(
    () => new SqliteSterileAccessDirectory(f.input.workflowFile),
    /separate/,
  );
  process.env.RUBY_STERILE_PREVIEW = "true";
  try {
    assert.throws(
      () => new LocalSqliteSterileRepository(f.input.workflowFile, "preview"),
      /interchanged/,
    );
    const old = join(f.dir, "old-preview.sqlite"),
      preview = new LocalSqliteSterileRepository(old, "preview");
    preview.close();
    delete process.env.RUBY_STERILE_PREVIEW;
    const copy = join(f.dir, "renamed.sqlite");
    copyFileSync(old, copy);
    assert.throws(
      () => new LocalSqliteSterileRepository(copy, "account"),
      /interchanged/,
    );
  } finally {
    delete process.env.RUBY_STERILE_PREVIEW;
  }
  const legacy = join(f.dir, "legacy.sqlite"),
    db = new DatabaseSync(legacy);
  db.exec("CREATE TABLE old_data(id TEXT)");
  db.close();
  assert.throws(
    () => new LocalSqliteSterileRepository(legacy, "account"),
    /start empty/,
  );
});
test("trusted offline grants retain versions and stale-write denial without changing workflows", async (t) => {
  const f = await fixture(t),
    access = new SqliteSterileAccessDirectory(f.input.accessFile);
  access.close();
  const changeFile = join(f.dir, "change.json"),
    change = {
      tenantId: f.input.tenantId,
      actorId: randomUUID(),
      status: "ACTIVE",
      facilities: [
        {
          facilityId: f.input.facilityId,
          capabilityEnabled: true,
          permissions: ["instruments:read"],
        },
      ],
      changedBy: randomUUID(),
      reason: "Fictional trusted setup",
      expectedVersion: 0,
    };
  writeFileSync(changeFile, JSON.stringify(change));
  const script = new URL(
    "../../../../scripts/sterile-account-access.mjs",
    import.meta.url,
  );
  const run = () =>
    spawnSync(
      process.execPath,
      [
        fileURLToPath(script),
        "--store",
        f.input.accessFile,
        "--change",
        changeFile,
      ],
      { encoding: "utf8" },
    );
  assert.equal(run().status, 0);
  assert.equal(run().status, 1);
  assert.equal(existsSync(f.input.workflowFile), false);
  const reopened = new SqliteSterileAccessDirectory(f.input.accessFile);
  assert.equal(
    (await reopened.findUser(change.tenantId, change.actorId)).version,
    1,
  );
  reopened.close();
});

test("identity facade refuses SQL writes and multi-statement queries before calling the provider", async () => {
  let calls = 0;
  const reads = readOnlyIdentityDatabase({
    query: async () => {
      calls++;
      return { rows: [] };
    },
  });
  for (const sql of [
    "UPDATE Identity.Users SET x=1",
    "SELECT 1; DELETE FROM Identity.Users",
    "SELECT * INTO copied FROM Identity.Users",
    "EXEC anything",
  ])
    assert.throws(() => reads.query(sql), /SELECT-only/);
  assert.throws(() => reads.execute("SELECT 1"), /read-only/);
  await reads.query("SELECT Id FROM [Identity].[Identities] WHERE Id=@id;", [
    { name: "id", value: "id" },
  ]);
  assert.equal(calls, 1);
});
