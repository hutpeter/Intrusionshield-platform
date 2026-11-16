import { randomBytes } from "node:crypto";
import { readFileSync, lstatSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { requirePrivateDirectory } from "./private-directory.mjs";

const names = [
  "athena-account-login.sql",
  "athena-account-password.txt",
  "athena-account-token.txt",
  "athena-account-runtime.json",
];
function file(path, privateFile = false) {
  if (typeof path !== "string" || !isAbsolute(path))
    throw Error("Absolute file required.");
  if (privateFile) requirePrivateDirectory(dirname(path));
  const s = lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink()) throw Error("Regular file required.");
  if (privateFile && process.platform !== "win32" && (s.mode & 0o077) !== 0)
    throw Error("Private file required.");
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}
function ca(path) {
  const s = file(path);
  if (!s.includes("-----BEGIN CERTIFICATE-----") || /PRIVATE KEY/.test(s))
    throw Error("Public SQL CA certificate required.");
  return path;
}
export function prepareRuntime(database, directory, certificateAuthorityFile) {
  if (
    typeof database !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(database) ||
    ["master", "model", "msdb", "tempdb"].includes(database.toLowerCase())
  )
    throw Error("Explicit application database required.");
  if (typeof directory !== "string" || !isAbsolute(directory))
    throw Error("Absolute private directory required.");
  const dir = requirePrivateDirectory(directory);
  ca(certificateAuthorityFile);
  const login = "ruby_athena_accounts_" + randomBytes(8).toString("hex"),
    password = "A9!" + randomBytes(32).toString("base64url"),
    token = randomBytes(48).toString("base64url");
  const read = [
    "Identity.Identities",
    "Identity.Users",
    "Identity.Roles",
    "Identity.Permissions",
    "Identity.RolePermissions",
    "Identity.IdentityRoles",
    "Identity.PlatformRoleAssignments",
    "Identity.UserAdministration",
    "Identity.AccountAdministrationAudit",
    "Authentication.Credentials",
    "Authentication.AccountSetupTokens",
    "EIS.TenantConfigurations",
    "Platform.Tenants",
    "Platform.TenantProvisioningAudit",
  ];
  const insert = [
    "Identity.Identities",
    "Identity.Users",
    "Identity.Roles",
    "Identity.RolePermissions",
    "Identity.IdentityRoles",
    "Identity.UserAdministration",
    "Identity.AccountAdministrationAudit",
    "Identity.AuthorizationAudit",
    "Authentication.Credentials",
    "Authentication.AccountSetupTokens",
    "EIS.TenantConfigurations",
    "Platform.Tenants",
    "Platform.TenantProvisioningAudit",
    "Platform.EventOutbox",
  ];
  const identifier = (t) =>
    t
      .split(".")
      .map((s) => "[" + s + "]")
      .join(".");
  const grant = (action, t) =>
    ` GRANT ${action} ON OBJECT::${identifier(t)} TO [${login}];`;
  const updates = {
    "Identity.Identities": "Status,UpdatedAt",
    "Identity.Users": "PreferredLanguage,UpdatedAt",
    "Identity.UserAdministration":
      "AccountType,PersonId,Version,SessionVersion,RequiresSetup,FacilityIds,ProductKeys",
    "Authentication.Credentials": "PasswordHash,PasswordChangedAt,UpdatedAt",
    "Authentication.AccountSetupTokens": "UsedAt",
    "Platform.TenantProvisioningAudit":
      "TargetTenantId,Status,CompletedAt,FailureCode",
  };
  const sql = `-- PRIVATE runtime credential. Keep outside source control and do not share.
-- No account/role bootstrap or schema migration is performed by this script.
USE [${database}];
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF DB_NAME()<>N'${database}' THROW 50000,'Wrong application database.',1;
${[...new Set([...read, ...insert])].map((t) => ` IF OBJECT_ID(N'${t}',N'U') IS NULL THROW 50000,'Required account administration table missing.',1;`).join("\n")}
 IF SUSER_ID(N'${login}') IS NOT NULL OR USER_ID(N'${login}') IS NOT NULL THROW 50000,'Runtime login/user already exists; no overwrite.',1;
 CREATE LOGIN [${login}] WITH PASSWORD=N'${password}',CHECK_POLICY=ON,DEFAULT_DATABASE=[${database}];
 CREATE USER [${login}] FOR LOGIN [${login}];
${read.map((t) => grant("SELECT", t)).join("\n")}
${insert.map((t) => grant("INSERT", t)).join("\n")}
${Object.entries(updates)
  .map(
    ([t, cols]) =>
      ` GRANT UPDATE (${cols
        .split(",")
        .map((s) => "[" + s + "]")
        .join(",")}) ON OBJECT::${identifier(t)} TO [${login}];`,
  )
  .join("\n")}
${grant("DELETE", "Identity.IdentityRoles")}
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
EXECUTE AS USER=N'${login}';
SELECT USER_NAME() AS RuntimeUser,DB_NAME() AS ConnectedDatabase,
 HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CONTROL') AS CanControlDatabase,
 HAS_PERMS_BY_NAME(N'Identity.PlatformRoleAssignments',N'OBJECT',N'INSERT') AS CanAssignSuperusers,
 HAS_PERMS_BY_NAME(N'Identity.Users',N'OBJECT',N'INSERT') AS CanCreateUsers;
REVERT;
`;
  return {
    [names[0]]: sql,
    [names[1]]: password + "\n",
    [names[2]]: token + "\n",
    [names[3]]:
      JSON.stringify(
        {
          server: "localhost",
          port: 1433,
          database,
          user: login,
          passwordFile: join(dir, names[1]),
          tokenSecretFile: join(dir, names[2]),
          certificateAuthorityFile,
        },
        null,
        2,
      ) + "\n",
  };
}
export function writeRuntime(directory, bundle) {
  const dir = requirePrivateDirectory(directory);
  if (
    !bundle ||
    Object.keys(bundle).sort().join(",") !== [...names].sort().join(",") ||
    Object.values(bundle).some((v) => typeof v !== "string")
  )
    throw Error("Invalid runtime bundle.");
  for (const name of names) {
    try {
      lstatSync(join(dir, name));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    throw Error("Runtime files already exist; no overwrite.");
  }
  const written = [];
  try {
    for (const name of names) {
      const p = join(dir, name);
      writeFileSync(p, bundle[name], { flag: "wx", mode: 0o600 });
      written.push(p);
    }
  } catch (e) {
    for (const p of written) unlinkSync(p);
    throw e;
  }
}
export function runtimeEnvironment(configPath, inherited = process.env) {
  const c = JSON.parse(file(configPath, true));
  if (
    Object.keys(c).sort().join(",") !==
      "certificateAuthorityFile,database,passwordFile,port,server,tokenSecretFile,user" ||
    c.server !== "localhost" ||
    c.port !== 1433 ||
    typeof c.database !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(c.database) ||
    ["master", "model", "msdb", "tempdb"].includes(c.database.toLowerCase()) ||
    typeof c.user !== "string" ||
    !/^ruby_athena_accounts_[a-f0-9]{16}$/.test(c.user)
  )
    throw Error("Invalid local runtime configuration.");
  const password = file(c.passwordFile, true).replace(/\r?\n$/, ""),
    token = file(c.tokenSecretFile, true).replace(/\r?\n$/, "");
  if (
    !/^A9![A-Za-z0-9_-]{43}$/.test(password) ||
    !/^[A-Za-z0-9_-]{64}$/.test(token)
  )
    throw Error("Invalid private runtime secret.");
  ca(c.certificateAuthorityFile);
  const env = Object.fromEntries(
    Object.entries(inherited).filter(
      ([k]) => !/^DB_|^RUBY_PLATFORM_DB_|^AUTH_|^NODE_OPTIONS$/i.test(k),
    ),
  );
  return {
    ...env,
    NODE_ENV: "development",
    DB_SERVER: c.server,
    DB_PORT: String(c.port),
    DB_DATABASE: c.database,
    DB_USERNAME: c.user,
    DB_PASSWORD: password,
    DB_ENCRYPT: "true",
    DB_TRUST_SERVER_CERTIFICATE: "false",
    NODE_EXTRA_CA_CERTS: c.certificateAuthorityFile,
    RUBY_ACCOUNT_ADMIN_API: "enabled",
    RUBY_TENANT_ADMIN_API: "enabled",
    RUBY_TENANT_CREATION: "enabled",
    AUTH_ALLOW_LOCAL_HTTP: "true",
    AUTH_HOST: "127.0.0.1",
    AUTH_PORT: "4400",
    AUTH_TOKEN_SECRET: token,
    AUTH_TOKEN_ISSUER: "ruby-athena-local-accounts",
    AUTH_TOKEN_AUDIENCE: "ruby-athena-local",
    AUTH_TOKEN_LIFETIME_SECONDS: "1800",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const a = process.argv.slice(2);
    if (
      a[0] === "prepare" &&
      a.length === 7 &&
      a[1] === "--database" &&
      a[3] === "--directory" &&
      a[5] === "--sql-ca"
    ) {
      writeRuntime(a[4], prepareRuntime(a[2], a[4], a[6]));
      console.log(
        "Prepared private Athena runtime login SQL, secrets and configuration. No database connection opened; no login, account or permission changed. Do not share these files.",
      );
    } else if (a[0] === "start" && a.length === 3 && a[1] === "--config") {
      const env = runtimeEnvironment(a[2]);
      const root = fileURLToPath(new URL("../", import.meta.url)),
        entry = join(root, "services/authentication/dist/index.js");
      if (!lstatSync(entry).isFile()) throw Error("Build required.");
      const child = spawn(process.execPath, [entry], {
        cwd: root,
        env,
        stdio: "inherit",
      });
      child.once("error", () => {
        console.error("Athena local account service could not start.");
        process.exitCode = 1;
      });
      child.once("exit", (code) => {
        process.exitCode = code ?? 1;
      });
      for (const signal of ["SIGINT", "SIGTERM"])
        process.on(signal, () => child.kill(signal));
    } else throw Error("Invalid arguments.");
  } catch {
    console.error(
      "Athena runtime preparation/start failed. Check arguments, private files, public SQL CA and authentication build. No SQL preparation file was executed by this tool.",
    );
    process.exitCode = 1;
  }
}
