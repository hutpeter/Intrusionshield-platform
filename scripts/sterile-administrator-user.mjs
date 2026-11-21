import { randomUUID } from "node:crypto";
import { lstatSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { PasswordHasher } from "../services/authentication/dist/security/PasswordHasher.js";
import {
  assertVerificationWorkspace,
  requirePrivateDirectory,
} from "./sterile-test-users.mjs";
const quote = (value) => "N'" + value.replaceAll("'", "''") + "'";
/** Local verification USER only; a new test-person mapping, not verified clinical staff enrollment. */
export async function prepareAdministratorUser(config, input) {
  assertVerificationWorkspace(config);
  if (
    !input ||
    Array.isArray(input) ||
    Object.keys(input).join(",") !== "administratorPassword" ||
    typeof input.administratorPassword !== "string" ||
    input.administratorPassword.length < 20 ||
    input.administratorPassword.length > 128 ||
    /[\r\n\0]/.test(input.administratorPassword)
  )
    throw Error(
      "One private administrator password of 20–128 characters is required.",
    );
  const id = randomUUID(),
    personId = randomUUID(),
    username = "sterile.admin.test",
    email = "sterile.admin.test@example.invalid",
    hash = await new PasswordHasher().hash(input.administratorPassword);
  const sql = `-- PRIVATE LOCAL VERIFICATION ADMINISTRATOR: contains a salted password hash.
-- Run only through authorized Windows administration against localhost:1433.
-- Adds one USER; no existing users, passwords, role memberships or SQL logins change.
USE [intrusionshield];
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRY
  BEGIN TRANSACTION;
  IF NOT EXISTS (SELECT 1 FROM EIS.TenantConfigurations WHERE tenant_id = '${config.tenantId}')
    THROW 50000, 'Expected verification tenant configuration missing.', 1;
  IF EXISTS (SELECT 1 FROM [Identity].[Identities] WITH (UPDLOCK, HOLDLOCK) WHERE TenantId = '${config.tenantId}' AND Id = '${id}')
    OR EXISTS (SELECT 1 FROM [Identity].[Users] WITH (UPDLOCK, HOLDLOCK) WHERE TenantId = '${config.tenantId}' AND (NormalizedUsername = ${quote(username.toUpperCase())} OR NormalizedEmail = ${quote(email.toUpperCase())}))
    THROW 50000, 'Dedicated administrator already exists; no account will be overwritten.', 1;
  INSERT INTO [Identity].[Identities] (TenantId, Id, IdentityType, Status, DisplayName, CreatedAt, UpdatedAt)
    VALUES ('${config.tenantId}', '${id}', N'USER', N'ACTIVE', N'Sterile access administrator', SYSUTCDATETIME(), SYSUTCDATETIME());
  INSERT INTO [Identity].[Users] (TenantId, IdentityId, Username, NormalizedUsername, Email, NormalizedEmail, EmailVerified, PreferredLanguage, CreatedAt, UpdatedAt)
    VALUES ('${config.tenantId}', '${id}', ${quote(username)}, ${quote(username.toUpperCase())}, ${quote(email)}, ${quote(email.toUpperCase())}, 0, N'en', SYSUTCDATETIME(), SYSUTCDATETIME());
  INSERT INTO [Authentication].[Credentials] (TenantId, IdentityId, PasswordHash, PasswordChangedAt, FailedAttemptCount, LockedUntil, CreatedAt, UpdatedAt)
    VALUES ('${config.tenantId}', '${id}', ${quote(hash)}, SYSUTCDATETIME(), 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME());
  COMMIT;
  SELECT Username, IdentityId FROM [Identity].[Users] WHERE TenantId = '${config.tenantId}' AND IdentityId = '${id}';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  THROW;
END CATCH;
`;
  return {
    "administrator-user.sql": sql,
    "administrator-access.json":
      JSON.stringify(
        {
          tenantId: config.tenantId,
          actorId: id,
          personId,
          status: "ACTIVE",
          facilities: [
            {
              facilityId: config.facilityId,
              capabilityEnabled: true,
              permissions: ["access:manage"],
            },
          ],
          expectedVersion: 0,
          changedBy: id,
          reason:
            "Owner-authorized OS bootstrap of dedicated local verification access administrator; not an authenticated web grant or clinical staff enrollment",
        },
        null,
        2,
      ) + "\n",
  };
}
export function writeAdministratorFiles(directory, files) {
  const full = requirePrivateDirectory(directory),
    expected = ["administrator-access.json", "administrator-user.sql"];
  if (!files || Object.keys(files).sort().join(",") !== expected.join(","))
    throw Error("Invalid administrator output bundle.");
  for (const name of expected) {
    try {
      lstatSync(join(full, name));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    throw Error("Administrator output already exists; no overwrite.");
  }
  const created = [];
  try {
    for (const name of expected) {
      const file = join(full, name);
      writeFileSync(file, files[name], { flag: "wx", mode: 0o600 });
      created.push(file);
    }
  } catch (error) {
    for (const file of created) unlinkSync(file);
    throw error;
  }
}
