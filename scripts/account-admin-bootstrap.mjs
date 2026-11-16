import { randomBytes, randomUUID, createHash } from "node:crypto";
import { writeFileSync, unlinkSync, lstatSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { requirePrivateDirectory } from "./private-directory.mjs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const q = (s) => "N'" + s.replaceAll("'", "''") + "'";
export function prepareBootstrap(v) {
  if (
    !v ||
    Object.keys(v).sort().join(",") !==
      (v.initializeTenant !== undefined
        ? "displayName,email,initializeTenant,origin,tenantId,username"
        : "displayName,email,origin,tenantId,username") ||
    (v.initializeTenant !== undefined &&
      typeof v.initializeTenant !== "boolean") ||
    !uuid.test(v.tenantId) ||
    typeof v.username !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._@+-]{1,199}$/.test(v.username) ||
    typeof v.email !== "string" ||
    v.email.length > 320 ||
    !/^\S+@\S+\.\S+$/.test(v.email) ||
    typeof v.displayName !== "string" ||
    !v.displayName.trim() ||
    v.displayName.length > 200
  )
    throw Error("Invalid initial administrator profile.");
  const url = new URL(v.origin);
  if (
    url.origin !== v.origin ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname))
    )
  )
    throw Error("HTTPS origin or explicit local development origin required.");
  const id = randomUUID(),
    role = randomUUID(),
    token = randomBytes(32).toString("base64url"),
    hash = createHash("sha256").update(token).digest("hex"),
    tenant = v.tenantId.toLowerCase();
  const initializeTenant = v.initializeTenant
    ? `
 IF NOT EXISTS(SELECT 1 FROM [Platform].[Tenants] WITH(UPDLOCK,HOLDLOCK) WHERE Id='${tenant}')
 BEGIN
  IF EXISTS(SELECT 1 FROM [Platform].[Tenants] WITH(UPDLOCK,HOLDLOCK) WHERE NormalizedCode=N'RUBY_PLATFORM') THROW 50000,'Platform administration tenant already registered under another ID.',1;
  INSERT INTO [Platform].[Tenants](Id,Code,NormalizedCode,DisplayName,CountryCode,Status) VALUES('${tenant}',N'ruby_platform',N'RUBY_PLATFORM',N'Platform administration',N'CA',N'ACTIVE');
 END;
 IF NOT EXISTS(SELECT 1 FROM EIS.TenantConfigurations WITH(UPDLOCK,HOLDLOCK) WHERE tenant_id='${tenant}')
 INSERT INTO EIS.TenantConfigurations(tenant_id,country_code,default_language,locale,time_zone,created_at,updated_at,version) VALUES('${tenant}',N'CA',N'en',N'en-CA',N'America/New_York',SYSUTCDATETIME(),SYSUTCDATETIME(),1);
`
    : "";
  const sql = `-- TRUSTED ONE-TIME INITIAL SUPERUSER BOOTSTRAP. Private setup-token hash only.
-- Review the selected identity/platform database before running. No migrations are applied here.
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
${initializeTenant}
 IF NOT EXISTS(SELECT 1 FROM [Platform].[Tenants] WITH(UPDLOCK,HOLDLOCK) WHERE Id='${tenant}' AND Status=N'ACTIVE')
  THROW 50000,'Registered active client required; no changes made.',1;
 IF EXISTS(SELECT 1 FROM [Identity].[PlatformRoleAssignments] a WITH(UPDLOCK,HOLDLOCK) JOIN [Identity].[RolePermissions] rp WITH(HOLDLOCK) ON rp.RoleId=a.RoleId AND rp.Scope=N'PLATFORM' JOIN [Identity].[Permissions] p WITH(HOLDLOCK) ON p.Id=rp.PermissionId AND p.Scope=N'PLATFORM' WHERE p.Resource=N'platform.users' AND p.Action=N'MANAGE')
  THROW 50000,'An account superuser is already assigned. Bootstrap refused.',1;
 IF EXISTS(SELECT 1 FROM [Identity].[Users] WITH(UPDLOCK,HOLDLOCK) WHERE TenantId='${tenant}' AND (NormalizedUsername=${q(v.username.toUpperCase())} OR NormalizedEmail=${q(v.email.toUpperCase())}))
  THROW 50000,'Account already exists. Nothing will be overwritten or promoted.',1;
 INSERT INTO [Identity].[Identities](TenantId,Id,IdentityType,Status,DisplayName,CreatedAt,UpdatedAt) VALUES('${tenant}','${id}',N'USER',N'PENDING',${q(v.displayName.trim())},SYSUTCDATETIME(),SYSUTCDATETIME());
 INSERT INTO [Identity].[Users](TenantId,IdentityId,Username,NormalizedUsername,Email,NormalizedEmail,EmailVerified,PreferredLanguage,CreatedAt,UpdatedAt) VALUES('${tenant}','${id}',${q(v.username)},${q(v.username.toUpperCase())},${q(v.email)},${q(v.email.toUpperCase())},0,NULL,SYSUTCDATETIME(),SYSUTCDATETIME());
 INSERT INTO [Identity].[UserAdministration](TenantId,IdentityId,AccountType,PersonId,Version,SessionVersion,RequiresSetup,FacilityIds,ProductKeys) VALUES('${tenant}','${id}',N'SUPERUSER',NULL,1,1,1,N'[]',N'[]');
 INSERT INTO [Identity].[Roles](Id,TenantId,Name,Scope) VALUES('${role}',NULL,N'Ruby account superuser',N'PLATFORM');
 INSERT INTO [Identity].[RolePermissions](RoleId,PermissionId,Scope) SELECT '${role}',Id,N'PLATFORM' FROM [Identity].[Permissions] WHERE Scope=N'PLATFORM' AND ((Resource=N'platform.users' AND Action=N'MANAGE') OR (Resource=N'platform.tenants' AND Action IN(N'READ',N'CREATE')));
 IF NOT EXISTS(SELECT 1 FROM [Identity].[RolePermissions] rp JOIN [Identity].[Permissions] p ON p.Id=rp.PermissionId WHERE rp.RoleId='${role}' AND p.Resource=N'platform.users' AND p.Action=N'MANAGE') THROW 50000,'Account administration permission missing; apply the reviewed migration first.',1;
 INSERT INTO [Identity].[PlatformRoleAssignments](TenantId,IdentityId,RoleId,Scope) VALUES('${tenant}','${id}','${role}',N'PLATFORM');
 INSERT INTO [Authentication].[AccountSetupTokens](TokenHash,TenantId,IdentityId,ExpiresAt,UsedAt) VALUES('${hash}','${tenant}','${id}',DATEADD(hour,1,SYSUTCDATETIME()),NULL);
 INSERT INTO [Identity].[AccountAdministrationAudit](Id,TenantId,ActorTenantId,ActorId,TargetId,Action,At,Reason,Version,Details) VALUES(NEWID(),'${tenant}','${tenant}','${id}','${id}',N'SUPERUSER_BOOTSTRAPPED',SYSUTCDATETIME(),N'Trusted initial OS/SQL administrator bootstrap',1,N'{"kind":"SUPERUSER","status":"PENDING"}');
 COMMIT;
 SELECT ${q(v.username)} AS Username,'${tenant}' AS TenantId,'${id}' AS IdentityId;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
`;
  return {
    sql,
    link: v.origin + "/#account-setup=" + token + "\n",
    id,
    tenantId: tenant,
  };
}
export function writeBootstrap(directory, files) {
  const dir = requirePrivateDirectory(directory),
    names = ["account-admin-bootstrap.sql", "account-admin-setup-link.txt"];
  for (const name of names) {
    try {
      lstatSync(join(dir, name));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    throw Error("Bootstrap files already exist; no overwrite allowed.");
  }
  const created = [];
  try {
    for (const [name, body] of [
      [names[0], files.sql],
      [names[1], files.link],
    ]) {
      writeFileSync(join(dir, name), body, { flag: "wx", mode: 0o600 });
      created.push(join(dir, name));
    }
  } catch (e) {
    for (const f of created) unlinkSync(f);
    throw e;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2),
      v = {};
    if (args.length !== 12 && args.length !== 14)
      throw Error("Invalid arguments.");
    for (let i = 0; i < args.length; i += 2) {
      if (
        ![
          "--tenant",
          "--username",
          "--email",
          "--name",
          "--origin",
          "--directory",
          "--initialize-tenant",
        ].includes(args[i]) ||
        v[args[i]] !== undefined
      )
        throw Error("Invalid arguments.");
      v[args[i]] = args[i + 1];
    }
    if (
      v["--initialize-tenant"] !== undefined &&
      !["true", "false"].includes(v["--initialize-tenant"])
    )
      throw Error("Invalid initialization option.");
    if (!isAbsolute(v["--directory"]))
      throw Error("Absolute private directory required.");
    const files = prepareBootstrap({
      tenantId: v["--tenant"],
      username: v["--username"],
      email: v["--email"],
      displayName: v["--name"],
      origin: v["--origin"],
      ...(v["--initialize-tenant"] !== undefined
        ? { initializeTenant: v["--initialize-tenant"] === "true" }
        : {}),
    });
    writeBootstrap(v["--directory"], files);
    console.log(
      "Prepared private bootstrap SQL and setup-link files. No SQL connection opened; no account or permission was changed.",
    );
  } catch {
    console.error(
      "Bootstrap preparation failed. Check the profile, origin, private directory and absence of existing bootstrap files. No database was contacted.",
    );
    process.exitCode = 1;
  }
}
