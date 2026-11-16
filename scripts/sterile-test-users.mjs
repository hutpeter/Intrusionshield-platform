import { requirePrivateDirectory } from "./private-directory.mjs";
export { requirePrivateDirectory } from "./private-directory.mjs";
import { randomUUID } from "node:crypto";
import { lstatSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { PasswordHasher } from "../services/authentication/dist/security/PasswordHasher.js";

const testTenant = "11111111-1111-4111-8111-111111111111";
const administrator = "22222222-2222-4222-8222-222222222222";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const readPermissions = [
  "dashboard:read",
  "instruments:read",
  "trays:read",
  "processing:read",
  "packaging:read",
  "cycles:read",
  "release:read",
  "distribution:read",
  "returns:read",
  "traceability:read",
  "recall:read",
  "procedures:read",
  "equipment:read",
  "equipment-incidents:read",
  "loaners:read",
  "consumables:read",
  "reports:read",
];
const quote = (value) => "N'" + value.replaceAll("'", "''") + "'";
export function assertVerificationWorkspace(config) {
  if (
    config.tenantId !== testTenant ||
    config.facilityName !== "Local account verification" ||
    !uuid.test(config.facilityId) ||
    config.identityDatabase.server !== "localhost" ||
    config.identityDatabase.port !== 1433 ||
    config.identityDatabase.database !== "intrusionshield"
  )
    throw Error(
      "This helper is limited to the local verification workspace and test tenant.",
    );
}
export async function prepareTestUsers(config, passwords) {
  assertVerificationWorkspace(config);
  if (
    !passwords ||
    Object.keys(passwords).sort().join(",") !==
      "operatorPassword,reviewerPassword" ||
    Object.values(passwords).some(
      (p) =>
        typeof p !== "string" ||
        p.length < 20 ||
        p.length > 128 ||
        /[\r\n\0]/.test(p),
    ) ||
    passwords.operatorPassword === passwords.reviewerPassword
  )
    throw Error(
      "Provide two different passwords of 20–128 characters, without newlines.",
    );
  const hasher = new PasswordHasher();
  const accounts = [];
  for (const role of ["operator", "reviewer"]) {
    const hash = await hasher.hash(passwords[role + "Password"]);
    accounts.push({
      role,
      id: randomUUID(),
      personId: randomUUID(),
      hash,
      username: "sterile." + role + ".test",
      displayName: "Sterile test " + role,
      email: "sterile." + role + ".test@example.invalid",
    });
  }
  const sql =
    `-- LOCAL VERIFICATION ACCOUNTS ONLY. Contains password hashes; keep private.\n-- Run through an authorized Windows administrator connection to localhost:1433.\n-- No schema changes, existing-account updates, role memberships or SQL logins.\nUSE [intrusionshield];\nSET NOCOUNT ON;\nSET XACT_ABORT ON;\nSET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\nBEGIN TRY\n  BEGIN TRANSACTION;\n  IF NOT EXISTS (SELECT 1 FROM EIS.TenantConfigurations WHERE tenant_id = '${testTenant}')\n    THROW 50000, 'Expected verification tenant configuration missing.', 1;\n` +
    accounts
      .map(
        (a) =>
          `  IF EXISTS (SELECT 1 FROM [Identity].[Identities] WITH (UPDLOCK, HOLDLOCK) WHERE TenantId = '${testTenant}' AND Id = '${a.id}')\n    OR EXISTS (SELECT 1 FROM [Identity].[Users] WITH (UPDLOCK, HOLDLOCK) WHERE TenantId = '${testTenant}' AND (NormalizedUsername = ${quote(a.username.toUpperCase())} OR NormalizedEmail = ${quote(a.email.toUpperCase())}))\n    THROW 50000, 'A verification account already exists; nothing will be overwritten.', 1;\n`,
      )
      .join("") +
    accounts
      .map(
        (a) =>
          `  INSERT INTO [Identity].[Identities] (TenantId, Id, IdentityType, Status, DisplayName, CreatedAt, UpdatedAt)\n    VALUES ('${testTenant}', '${a.id}', N'USER', N'ACTIVE', ${quote(a.displayName)}, SYSUTCDATETIME(), SYSUTCDATETIME());\n  INSERT INTO [Identity].[Users] (TenantId, IdentityId, Username, NormalizedUsername, Email, NormalizedEmail, EmailVerified, PreferredLanguage, CreatedAt, UpdatedAt)\n    VALUES ('${testTenant}', '${a.id}', ${quote(a.username)}, ${quote(a.username.toUpperCase())}, ${quote(a.email)}, ${quote(a.email.toUpperCase())}, 0, N'en', SYSUTCDATETIME(), SYSUTCDATETIME());\n  INSERT INTO [Authentication].[Credentials] (TenantId, IdentityId, PasswordHash, PasswordChangedAt, FailedAttemptCount, LockedUntil, CreatedAt, UpdatedAt)\n    VALUES ('${testTenant}', '${a.id}', ${quote(a.hash)}, SYSUTCDATETIME(), 0, NULL, SYSUTCDATETIME(), SYSUTCDATETIME());\n`,
      )
      .join("") +
    `  COMMIT;\n  SELECT Username, IdentityId FROM [Identity].[Users] WHERE TenantId = '${testTenant}' AND IdentityId IN (${accounts.map((a) => "'" + a.id + "'").join(", ")});\nEND TRY\nBEGIN CATCH\n  IF @@TRANCOUNT > 0 ROLLBACK;\n  THROW;\nEND CATCH;\n`;
  const files = { "verification-users.sql": sql };
  for (const a of accounts) {
    const writes =
      a.role === "operator"
        ? ["instruments:write", "processing:write"]
        : ["processing:inspect", "processing:correct", "processing:cancel"];
    files[a.role + "-access.json"] =
      JSON.stringify(
        {
          tenantId: testTenant,
          actorId: a.id,
          personId: a.personId,
          status: "ACTIVE",
          facilities: [
            {
              facilityId: config.facilityId,
              capabilityEnabled: true,
              permissions: [...readPermissions, ...writes],
            },
          ],
          expectedVersion: 0,
          changedBy: administrator,
          reason:
            "Initial local verification test-" +
            a.role +
            " assignment; not pilot staff enrollment",
        },
        null,
        2,
      ) + "\n";
  }
  return files;
}
export function writeTestUserFiles(directory, files) {
  const full = requirePrivateDirectory(directory);
  const expected = [
    "operator-access.json",
    "reviewer-access.json",
    "verification-users.sql",
  ];
  if (Object.keys(files).sort().join(",") !== expected.join(","))
    throw Error("Invalid verification output files.");
  for (const name of expected) {
    try {
      lstatSync(join(full, name));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    throw Error(
      "Verification output already exists; nothing will be overwritten.",
    );
  }
  const created = [];
  try {
    for (const name of expected) {
      writeFileSync(join(full, name), files[name], { flag: "wx", mode: 0o600 });
      created.push(join(full, name));
    }
  } catch (error) {
    for (const path of created) unlinkSync(path);
    throw error;
  }
}

export async function prepareReviewerPasswordReset(
  config,
  grant,
  identityId,
  input,
) {
  assertVerificationWorkspace(config);
  if (
    typeof identityId !== "string" ||
    !uuid.test(identityId) ||
    !grant ||
    typeof grant.actorId !== "string" ||
    grant.actorId.toLowerCase() !== identityId.toLowerCase() ||
    grant.tenantId !== testTenant ||
    !uuid.test(grant.personId) ||
    grant.status !== "ACTIVE" ||
    !Array.isArray(grant.facilities) ||
    grant.facilities.length !== 1 ||
    grant.facilities[0].facilityId !== config.facilityId ||
    !Array.isArray(grant.facilities[0].permissions) ||
    !grant.facilities[0].permissions.includes("processing:inspect") ||
    grant.facilities[0].permissions.includes("processing:write")
  )
    throw Error(
      "Expected existing local verification reviewer identity and grant required.",
    );
  if (
    !input ||
    Object.keys(input).join(",") !== "reviewerPassword" ||
    typeof input.reviewerPassword !== "string" ||
    input.reviewerPassword.length < 20 ||
    input.reviewerPassword.length > 128 ||
    /[\r\n\0]/.test(input.reviewerPassword)
  )
    throw Error("One replacement password of 20–128 characters is required.");
  const hash = await new PasswordHasher().hash(input.reviewerPassword);
  return `-- PRIVATE: replacement password hash for the existing verification reviewer only.
-- Execute through an authorized Windows administrator connection to localhost:1433.
USE [intrusionshield];
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF NOT EXISTS (
    SELECT 1 FROM [Identity].[Identities] i WITH (UPDLOCK, HOLDLOCK)
    JOIN [Identity].[Users] u WITH (UPDLOCK, HOLDLOCK)
      ON u.TenantId = i.TenantId AND u.IdentityId = i.Id
    WHERE i.TenantId = '${testTenant}' AND i.Id = '${identityId.toLowerCase()}'
      AND i.IdentityType = N'USER' AND i.Status = N'ACTIVE'
      AND u.NormalizedUsername = N'STERILE.REVIEWER.TEST'
  ) THROW 50000, 'Expected active verification reviewer not found; no reset performed.', 1;
  UPDATE [Authentication].[Credentials]
    SET PasswordHash = ${quote(hash)}, PasswordChangedAt = SYSUTCDATETIME(), UpdatedAt = SYSUTCDATETIME()
    WHERE TenantId = '${testTenant}' AND IdentityId = '${identityId.toLowerCase()}';
  IF @@ROWCOUNT <> 1 THROW 50000, 'Expected exactly one credential; reset rolled back.', 1;
  COMMIT;
  PRINT 'Verification reviewer password reset. Identity and permissions unchanged.';
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK;
  THROW;
END CATCH;
`;
}
