import { randomBytes } from "node:crypto";
import { readFileSync, lstatSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { requirePrivateDirectory } from "./private-directory.mjs";

const names = [
  "athena-his-login.sql",
  "athena-his-password.txt",
  "athena-his-runtime.json",
];
const tables = [
  "Persons",
  "PersonIdentifiers",
  "PersonAddresses",
  "Patients",
  "PatientEmergencyContacts",
  "Practitioners",
  "PractitionerLicenses",
  "PractitionerSpecialties",
  "Facilities",
  "PersonFacilityAffiliations",
  "PatientRegistrations",
  "Encounters",
  "Appointments",
  "AvailabilityRules",
  "AvailabilityExceptions",
  "ClinicalLocations",
  "Beds",
  "Admissions",
  "BedAssignments",
];
const replaceChildren = [
  "PersonIdentifiers",
  "PersonAddresses",
  "PatientEmergencyContacts",
  "PractitionerLicenses",
  "PractitionerSpecialties",
];
function read(path, privateFile = false) {
  if (typeof path !== "string" || !isAbsolute(path))
    throw Error("Absolute file required.");
  if (privateFile) requirePrivateDirectory(dirname(path));
  const s = lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink()) throw Error("Regular file required.");
  if (privateFile && process.platform !== "win32" && (s.mode & 0o077) !== 0)
    throw Error("Private file required.");
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "");
}
function validateDatabase(database) {
  if (
    typeof database !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(database) ||
    ["master", "model", "msdb", "tempdb"].includes(database.toLowerCase())
  )
    throw Error("Explicit application database required.");
}
function validateCa(path) {
  const s = read(path);
  if (!s.includes("-----BEGIN CERTIFICATE-----") || /PRIVATE KEY/.test(s))
    throw Error("Public SQL CA certificate required.");
}
export function prepareHisRuntime(
  database,
  directory,
  certificateAuthorityFile,
) {
  validateDatabase(database);
  if (typeof directory !== "string" || !isAbsolute(directory))
    throw Error("Absolute private directory required.");
  const dir = requirePrivateDirectory(directory);
  validateCa(certificateAuthorityFile);
  const login = "ruby_athena_his_" + randomBytes(8).toString("hex"),
    password = "A9!" + randomBytes(32).toString("base64url");
  const grant = (action, t) =>
    ` GRANT ${action} ON OBJECT::[HIS].[${t}] TO [${login}];`;
  const sql = `-- PRIVATE: local HIS runtime credential. Do not share or commit.
-- No schema migration, fixture seeding or account bootstrap is performed.
USE [${database}];
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF DB_NAME()<>N'${database}' THROW 50000,'Wrong HIS application database.',1;
${tables.map((t) => ` IF OBJECT_ID(N'HIS.${t}',N'U') IS NULL THROW 50000,'Required HIS table missing; no changes made.',1;`).join("\n")}
 IF SUSER_ID(N'${login}') IS NOT NULL OR USER_ID(N'${login}') IS NOT NULL THROW 50000,'HIS login/user already exists; no overwrite.',1;
 CREATE LOGIN [${login}] WITH PASSWORD=N'${password}',CHECK_POLICY=ON,DEFAULT_DATABASE=[${database}];
 CREATE USER [${login}] FOR LOGIN [${login}];
${tables.flatMap((t) => [grant("SELECT", t), grant("INSERT", t), ...(replaceChildren.includes(t) ? [grant("DELETE", t)] : [grant("UPDATE", t)])]).join("\n")}
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
EXECUTE AS USER=N'${login}';
SELECT USER_NAME() AS RuntimeUser,DB_NAME() AS ConnectedDatabase,
 HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CONTROL') AS CanControlDatabase,
 COALESCE(HAS_PERMS_BY_NAME(N'Identity.Users',N'OBJECT',N'INSERT'),0) AS CanCreateAccounts,
 HAS_PERMS_BY_NAME(N'HIS.Persons',N'OBJECT',N'SELECT') AS CanReadPersons,
 HAS_PERMS_BY_NAME(N'HIS.Persons',N'OBJECT',N'INSERT') AS CanCreatePersons;
REVERT;
`;
  return {
    [names[0]]: sql,
    [names[1]]: password + "\n",
    [names[2]]:
      JSON.stringify(
        {
          runtimeKind: "ATHENA_HIS_LOCAL",
          server: "localhost",
          port: 1433,
          database,
          user: login,
          passwordFile: join(dir, names[1]),
          certificateAuthorityFile,
        },
        null,
        2,
      ) + "\n",
  };
}
export function writeHisRuntime(directory, bundle) {
  const dir = requirePrivateDirectory(directory);
  if (
    !bundle ||
    Object.keys(bundle).sort().join(",") !== [...names].sort().join(",") ||
    Object.values(bundle).some((v) => typeof v !== "string")
  )
    throw Error("Invalid HIS runtime bundle.");
  for (const name of names) {
    try {
      lstatSync(join(dir, name));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    throw Error("HIS runtime files already exist; no overwrite.");
  }
  const written = [];
  try {
    for (const name of names) {
      const path = join(dir, name);
      writeFileSync(path, bundle[name], { flag: "wx", mode: 0o600 });
      written.push(path);
    }
  } catch (e) {
    for (const path of written) unlinkSync(path);
    throw e;
  }
}
export function hisRuntimeEnvironment(configPath, inherited = process.env) {
  const c = JSON.parse(read(configPath, true));
  if (
    Object.keys(c).sort().join(",") !==
      "certificateAuthorityFile,database,passwordFile,port,runtimeKind,server,user" ||
    c.runtimeKind !== "ATHENA_HIS_LOCAL" ||
    c.server !== "localhost" ||
    c.port !== 1433 ||
    typeof c.user !== "string" ||
    !/^ruby_athena_his_[a-f0-9]{16}$/.test(c.user)
  )
    throw Error("Invalid local HIS runtime configuration.");
  validateDatabase(c.database);
  validateCa(c.certificateAuthorityFile);
  const password = read(c.passwordFile, true).replace(/\r?\n$/, "");
  if (!/^A9![A-Za-z0-9_-]{43}$/.test(password))
    throw Error("Invalid private HIS password.");
  const env = Object.fromEntries(
    Object.entries(inherited).filter(
      ([k]) => !/^DB_|^RUBY_.*_DB_|^AUTH_|^HIS_|^NODE_OPTIONS$/i.test(k),
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
    HIS_HOST: "127.0.0.1",
    HIS_PORT: "4300",
    HIS_AUTHORIZATION_ORIGIN: "http://127.0.0.1:4400",
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
      writeHisRuntime(a[4], prepareHisRuntime(a[2], a[4], a[6]));
      console.log(
        "Prepared private HIS runtime login SQL, password and configuration. No SQL connection opened; no database, login, account or permission changed. Do not share these files.",
      );
    } else if (a[0] === "start" && a.length === 3 && a[1] === "--config") {
      const env = hisRuntimeEnvironment(a[2]),
        root = fileURLToPath(new URL("../", import.meta.url)),
        entry = join(root, "services/his/dist/index.js");
      if (!lstatSync(entry).isFile())
        throw Error("HIS dependency build required.");
      const child = spawn(process.execPath, [entry], {
        cwd: root,
        env,
        stdio: "inherit",
      });
      child.once("error", () => {
        console.error("Local Athena HIS service could not start.");
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
      "HIS runtime preparation/start failed. Check arguments, private files, public SQL CA and HIS dependency build. No generated SQL file was executed by this tool.",
    );
    process.exitCode = 1;
  }
}
