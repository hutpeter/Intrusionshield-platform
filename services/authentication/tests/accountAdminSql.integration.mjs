/** Explicit disposable SQL check. Never uses DB_* or a default database.
 * Run: node services/authentication/tests/accountAdminSql.integration.mjs --config <private JSON>
 * JSON: {server,port,database,user,passwordFile}; database must be an EMPTY
 * Ruby_AccountAdmin_Test_* database. TLS validation stays enabled.
 */
import assert from "node:assert/strict";
import { readFileSync, lstatSync } from "node:fs";
import { isAbsolute } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { SqlServerProvider } from "../../../packages/database/dist/index.js";
import { AccountAdministration } from "../dist/accounts/service.js";
import { createSqlAccountStore } from "../dist/accounts/sql.js";
import { prepareBootstrap } from "../../../scripts/account-admin-bootstrap.mjs";
import { PasswordHasher } from "../dist/security/PasswordHasher.js";
let database;
try {
  const args = process.argv.slice(2);
  assert.equal(args.length, 2);
  assert.equal(args[0], "--config");
  assert.ok(isAbsolute(args[1]));
  const config = JSON.parse(
    readFileSync(args[1], "utf8").replace(/^\uFEFF/, ""),
  );
  assert.equal(
    Object.keys(config).sort().join(","),
    "database,passwordFile,port,server,user",
  );
  assert.match(config.database, /^Ruby_AccountAdmin_Test_[A-Za-z0-9_]{1,40}$/);
  assert.ok(typeof config.server === "string" && config.server.length > 0);
  assert.ok(
    Number.isInteger(config.port) && config.port > 0 && config.port <= 65535,
  );
  assert.ok(isAbsolute(config.passwordFile));
  const stat = lstatSync(config.passwordFile);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  if (process.platform !== "win32") assert.equal(stat.mode & 0o077, 0);
  const options = {
    server: config.server,
    port: config.port,
    database: config.database,
    user: config.user,
    password: readFileSync(config.passwordFile, "utf8")
      .replace(/^\uFEFF/, "")
      .replace(/\r?\n$/, ""),
    encrypt: true,
    trustServerCertificate: false,
  };
  database = new SqlServerProvider(options);
  await database.connect();
  const tables = await database.query(
    "SELECT COUNT(*) AS n FROM sys.tables WHERE is_ms_shipped=0",
  );
  assert.equal(
    tables.rows[0].n,
    0,
    "Disposable target must be empty. No existing database is reset.",
  );
  for (const file of [
    "packages/identity-persistence/sql/001_identity_foundation.sql",
    "packages/identity-persistence/sql/002_authorization_foundation.sql",
    "services/authentication/sql/001_authentication_foundation.sql",
    "packages/tenant-configuration/sql/001_tenant_configuration.sql",
    "database-isolation/sql/platform/003_tenant_registry.sql",
    "services/authentication/sql/006_account_administration.sql",
    "services/authentication/sql/007_client_provisioning_support.sql",
    "services/authentication/sql/008_athena_permissions.sql",
  ]) {
    for (const sql of readFileSync(file, "utf8")
      .split(/^\s*GO\s*$/im)
      .filter((s) => s.trim()))
      await database.execute(
        file.endsWith("007_client_provisioning_support.sql")
          ? // Reproduce sqlcmd defaults that previously made filtered-index DDL fail.
            "SET QUOTED_IDENTIFIER OFF; SET ANSI_NULLS OFF; SET ANSI_PADDING OFF; SET ANSI_WARNINGS OFF; SET ARITHABORT OFF; SET CONCAT_NULL_YIELDS_NULL OFF; SET NUMERIC_ROUNDABORT ON;\n" +
              sql
          : sql,
      );
  }
  const filtered = await database.query(
    "SELECT name FROM sys.indexes WHERE object_id=OBJECT_ID(N'Platform.EventOutbox') AND has_filter=1 AND is_disabled=0",
  );
  assert.deepEqual(filtered.rows.map((r) => r.name).sort(), [
    "IX_PlatformEventOutbox_ExpiredLocks",
    "IX_PlatformEventOutbox_Pending",
  ]);
  await database.execute(
    readFileSync(
      "services/authentication/sql/007_client_provisioning_support.sql",
      "utf8",
    ),
  );
  // Forward-only administration migration must be safely repeatable.
  await database.execute(
    readFileSync(
      "services/authentication/sql/006_account_administration.sql",
      "utf8",
    ),
  );
  const tenant = randomUUID(),
    otherTenant = randomUUID(),
    facility = randomUUID(),
    role = randomUUID(),
    permission = randomUUID();
  for (const [id, code] of [
    [tenant, "ADMINCHECKA"],
    [otherTenant, "ADMINCHECKB"],
  ])
    await database.execute(
      `INSERT INTO [Platform].[Tenants](Id,Code,NormalizedCode,DisplayName,CountryCode,Status) VALUES(@id,@code,@code,@code,N'CA',N'ACTIVE'); INSERT INTO EIS.TenantConfigurations(tenant_id,country_code,default_language,locale,time_zone,created_at,updated_at,version) VALUES(@id,N'CA',N'en',N'en-CA',N'America/New_York',SYSUTCDATETIME(),SYSUTCDATETIME(),1)`,
      [
        { name: "id", value: id },
        { name: "code", value: code },
      ],
    );
  await database.execute(
    `INSERT INTO [Identity].[Permissions](Id,Name,Resource,Action,Scope) VALUES(@permission,N'Read people',N'athena.people',N'READ',N'TENANT'); INSERT INTO [Identity].[Roles](Id,TenantId,Name,Scope) VALUES(@role,@tenant,N'Reader',N'TENANT'); INSERT INTO [Identity].[RolePermissions](RoleId,PermissionId,Scope) VALUES(@role,@permission,N'TENANT')`,
    [
      { name: "permission", value: permission },
      { name: "role", value: role },
      { name: "tenant", value: tenant },
    ],
  );
  const bootstrap = prepareBootstrap({
    tenantId: tenant,
    username: "owner.sqlcheck",
    email: "owner@example.invalid",
    displayName: "Disposable owner",
    origin: "https://localhost:5173",
  });
  await database.execute(bootstrap.sql);
  await assert.rejects(() => database.execute(bootstrap.sql));
  // Existing tenant creation remains the authority for registry/settings/outbox.
  const { TenantProvisioningService } =
    await import("../dist/application/TenantProvisioningService.js");
  const { AuditedTenantProvisioningService } =
    await import("../dist/application/AuditedTenantProvisioningService.js");
  const { TenantProvisioningAudit } =
    await import("../dist/application/TenantProvisioningAudit.js");
  const { SqlPlatformTenantRepository } =
    await import("../dist/application/SqlPlatformTenantRepository.js");
  const { SqlTenantConfigurationRepository } =
    await import("../../../packages/tenant-configuration/dist/index.js");
  const { SqlEventOutboxRepository } =
    await import("../../../packages/event-persistence/dist/index.js");
  const clientWriter = new SqlServerProvider(options),
    clientAudit = new SqlServerProvider(options);
  try {
    await clientWriter.connect();
    await clientAudit.connect();
    const clients = new AuditedTenantProvisioningService(
      new TenantProvisioningService(
        clientWriter,
        new SqlPlatformTenantRepository(clientWriter),
        new SqlTenantConfigurationRepository(clientWriter),
        new SqlEventOutboxRepository(clientWriter),
      ),
      new TenantProvisioningAudit(clientAudit),
    );
    const createdClient = await clients.create(
      {
        code: "NEWCLIENT",
        displayName: "New disposable client",
        countryCode: "CA",
      },
      {
        actorIdentityId: bootstrap.id,
        actorTenantId: tenant,
        correlationId: randomUUID(),
      },
    );
    const row = (
      await database.query(
        "SELECT Status AS status FROM [Platform].[TenantProvisioningAudit] WHERE TargetTenantId=@id",
        [{ name: "id", value: createdClient.id }],
      )
    ).rows[0];
    assert.equal(row.status, "SUCCEEDED");
    assert.equal(
      (
        await database.query(
          "SELECT COUNT(*) AS n FROM [Platform].[EventOutbox] WHERE TenantId=@id",
          [{ name: "id", value: createdClient.id }],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await clientWriter.disconnect();
    await clientAudit.disconnect();
  }
  const service = new AccountAdministration(createSqlAccountStore(options)),
    password = "Disposable!" + randomBytes(24).toString("base64url");
  await service.complete({
    token: bootstrap.link.trim().split("=")[1],
    password,
  });
  const principal = async (id) => ({
    tenantId: tenant,
    id,
    sessionVersion: (await service.session(tenant, id)).sessionVersion,
  });
  const root = await principal(bootstrap.id);
  const athenaRoles = await service.prepareAthenaRoles(root, tenant, {
    reason: "Verify SQL Athena role catalog",
  });
  assert.deepEqual(
    (
      await service.prepareAthenaRoles(root, tenant, {
        reason: "Verify idempotence",
      })
    ).roleIds,
    athenaRoles.roleIds,
  );
  const catalog = await service.roles(root, tenant),
    viewer = catalog.find((r) => r.name === "Athena viewer");
  const readAccount = await service.create(root, tenant, {
    username: "athena.viewer.check",
    email: "athena.viewer@example.invalid",
    displayName: "Disposable Athena viewer",
    kind: "USER",
    personId: null,
    facilityIds: [],
    productKeys: ["athena"],
    roleIds: [viewer.id],
    reason: "Verify product access",
  });
  await service.complete({ token: readAccount.setupToken, password });
  const viewerPrincipal = await principal(readAccount.user.id);
  assert.equal(
    (await service.athenaAccess(viewerPrincipal, { action: "READ" })).tenantId,
    tenant,
  );
  await assert.rejects(() =>
    service.athenaAccess(viewerPrincipal, { action: "WRITE" }),
  );
  const body = {
    username: "client.admin.sqlcheck",
    email: "admin@example.invalid",
    displayName: "Disposable client admin",
    kind: "CLIENT_ADMIN",
    personId: randomUUID(),
    roleIds: [role],
    facilityIds: [facility],
    productKeys: ["athena"],
    reason: "Disposable integration check",
  };
  const admin = await service.create(root, tenant, body);
  await service.complete({ token: admin.setupToken, password });
  const actor = await principal(admin.user.id);
  assert.equal((await service.context(actor)).kind, "CLIENT_ADMIN");
  const regular = await service.create(actor, tenant, {
    ...body,
    kind: "USER",
    username: "regular.sqlcheck",
    email: "regular@example.invalid",
    personId: randomUUID(),
  });
  await service.complete({ token: regular.setupToken, password });
  await assert.rejects(() =>
    service.complete({ token: regular.setupToken, password }),
  );
  await assert.rejects(() =>
    service.create(actor, otherTenant, { ...body, kind: "USER" }),
  );
  await assert.rejects(() =>
    service.create(actor, tenant, {
      ...body,
      username: "forbidden.admin",
      email: "forbidden@example.invalid",
    }),
  );
  let user = (await service.list(root, tenant)).find(
      (u) => u.id === regular.user.id,
    ),
    before = structuredClone(user),
    oldSession = await principal(user.id);
  const reset = await service.reset(root, tenant, user.id, {
    version: user.version,
    reason: "Disposable reset",
  });
  await assert.rejects(() => service.context(oldSession));
  await service.complete({
    token: reset.setupToken,
    password: password + "new",
  });
  user = (await service.list(root, tenant)).find((u) => u.id === user.id);
  assert.equal(user.personId, before.personId);
  assert.deepEqual(user.roleIds, before.roleIds);
  assert.deepEqual(user.facilityIds, before.facilityIds);
  const credential = (
    await database.query(
      "SELECT PasswordHash AS hash FROM [Authentication].[Credentials] WHERE TenantId=@tenant AND IdentityId=@id",
      [
        { name: "tenant", value: tenant },
        { name: "id", value: user.id },
      ],
    )
  ).rows[0];
  assert.equal(
    await new PasswordHasher().verify(password + "new", credential.hash),
    true,
  );
  const edit = {
    version: user.version,
    kind: "USER",
    personId: user.personId,
    roleIds: user.roleIds,
    facilityIds: user.facilityIds,
    productKeys: user.productKeys,
    reason: "Disposable concurrent edit",
  };
  const race = await Promise.allSettled([
    service.accessChange(root, tenant, user.id, edit),
    service.accessChange(root, tenant, user.id, edit),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  user = (await service.list(root, tenant)).find((u) => u.id === user.id);
  await service.status(root, tenant, user.id, {
    version: user.version,
    enabled: false,
    reason: "Disposable disable",
  });
  await assert.rejects(async () => service.context(await principal(user.id)));
  // A deliberately failing audit trigger must roll back identity/profile/roles/setup.
  await database.execute(
    "CREATE TRIGGER [Identity].[AccountAdminCheckAuditFailure] ON [Identity].[AccountAdministrationAudit] AFTER INSERT AS BEGIN THROW 50003,'Simulated audit failure',1; END",
  );
  try {
    await assert.rejects(() =>
      service.create(root, tenant, {
        ...body,
        kind: "USER",
        username: "rollback.sqlcheck",
        email: "rollback@example.invalid",
      }),
    );
    const rows = await database.query(
      "SELECT COUNT(*) AS n FROM [Identity].[Users] WHERE TenantId=@tenant AND NormalizedUsername=N'ROLLBACK.SQLCHECK'",
      [{ name: "tenant", value: tenant }],
    );
    assert.equal(rows.rows[0].n, 0);
  } finally {
    await database.execute(
      "DROP TRIGGER [Identity].[AccountAdminCheckAuditFailure]",
    );
  }
  assert.ok(
    (await service.history(root, tenant)).some(
      (e) => e.action === "ACCOUNT_DISABLED",
    ),
  );
  console.log(
    "PASS disposable SQL: migrations and rerun, bootstrap guard, account hierarchy, private password setup/reset, preserved scopes, tenant isolation, stale edits and audit rollback.",
  );
  console.log(
    "Disposable database retained for review. No other database was migrated or reset.",
  );
} catch {
  console.error(
    "Disposable account SQL check failed. Stop and inspect only the explicitly selected test database. No production/default database is selected by this tool.",
  );
  process.exitCode = 1;
} finally {
  await database?.disconnect();
}
