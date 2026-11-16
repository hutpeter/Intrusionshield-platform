import { randomBytes } from "node:crypto";
import { lstatSync, writeFileSync, unlinkSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";
import { requirePrivateDirectory } from "./private-directory.mjs";

export function prepareSqlCheck(database, directory) {
  if (
    typeof database !== "string" ||
    !/^Ruby_AccountAdmin_Test_[A-Za-z0-9_]{1,40}$/.test(database)
  )
    throw Error("Explicit disposable test database required.");
  if (typeof directory !== "string" || !isAbsolute(directory))
    throw Error("Absolute private directory required.");
  const dir = requirePrivateDirectory(directory);
  const login = "ruby_admin_check_" + randomBytes(8).toString("hex");
  const password = "A9!" + randomBytes(32).toString("base64url");
  const passwordFile = join(dir, "account-admin-sql-check-password.txt");
  // Identifiers are restricted above; generated login/password contain no SQL quotes.
  const sql = `-- PRIVATE: generated disposable-test credential. Do not share this file.
-- Preparation did not connect to SQL. Execute only against the intended local server.
USE [${database}];
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF DB_NAME() <> N'${database}' THROW 50000,'Wrong test database.',1;
 IF EXISTS(SELECT 1 FROM sys.tables WHERE is_ms_shipped=0)
  THROW 50000,'Test database is not empty; no changes made.',1;
 IF SUSER_ID(N'${login}') IS NOT NULL OR USER_ID(N'${login}') IS NOT NULL
  THROW 50000,'Test login/user already exists; nothing overwritten.',1;
 CREATE LOGIN [${login}] WITH PASSWORD=N'${password}', CHECK_POLICY=ON, DEFAULT_DATABASE=[${database}];
 CREATE USER [${login}] FOR LOGIN [${login}];
 ALTER ROLE [db_owner] ADD MEMBER [${login}];
 COMMIT;
 SELECT N'${database}' AS TestDatabase,N'${login}' AS TestLogin;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
`;
  return {
    "account-admin-sql-check-login.sql": sql,
    "account-admin-sql-check-password.txt": password + "\n",
    "account-admin-sql-check.json":
      JSON.stringify(
        {
          server: "localhost",
          port: 1433,
          database,
          user: login,
          passwordFile,
        },
        null,
        2,
      ) + "\n",
  };
}
export function writeSqlCheck(directory, files) {
  const dir = requirePrivateDirectory(directory);
  const expected = [
    "account-admin-sql-check-login.sql",
    "account-admin-sql-check-password.txt",
    "account-admin-sql-check.json",
  ];
  if (
    !files ||
    Object.keys(files).sort().join(",") !== expected.sort().join(",") ||
    Object.values(files).some((v) => typeof v !== "string")
  )
    throw Error("Invalid private test bundle.");
  for (const name of expected) {
    try {
      lstatSync(join(dir, name));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    throw Error("Test preparation files already exist; no overwrite allowed.");
  }
  const written = [];
  try {
    for (const name of expected) {
      const path = join(dir, name);
      writeFileSync(path, files[name], { flag: "wx", mode: 0o600 });
      written.push(path);
    }
  } catch (e) {
    for (const path of written) unlinkSync(path);
    throw e;
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    if (
      args.length !== 4 ||
      args[0] !== "--database" ||
      args[2] !== "--directory"
    )
      throw Error("Invalid arguments.");
    writeSqlCheck(args[3], prepareSqlCheck(args[1], args[3]));
    console.log(
      "Prepared private disposable SQL test login, password and connection files. No SQL connection opened and no database/login changed. Do not share these files.",
    );
  } catch {
    console.error(
      "Preparation failed. Check the disposable database name, absolute private directory and absence of existing files. No SQL connection was opened.",
    );
    process.exitCode = 1;
  }
}
