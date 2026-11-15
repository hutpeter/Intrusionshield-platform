import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PasswordHasher } from "../services/authentication/dist/security/PasswordHasher.js";
import {
  prepareReviewerPasswordReset,
  prepareTestUsers,
} from "./sterile-test-users.mjs";
import { spawnSync } from "node:child_process";
const config = () => ({
  tenantId: "11111111-1111-4111-8111-111111111111",
  facilityId: randomUUID(),
  facilityName: "Local account verification",
  identityDatabase: {
    server: "localhost",
    port: 1433,
    database: "intrusionshield",
  },
});
async function fixture() {
  const c = config(),
    files = await prepareTestUsers(c, {
      operatorPassword: "Original operator test password 123",
      reviewerPassword: "Original reviewer test password 456",
    });
  return { c, grant: JSON.parse(files["reviewer-access.json"]) };
}
test("reset uses existing hasher and exact active username/tenant/identity guards; changes only credential hash and dates", async () => {
  const { c, grant } = await fixture(),
    before = structuredClone(grant),
    password = "New reviewer password '🔐' 12345";
  const sql = await prepareReviewerPasswordReset(
    c,
    grant,
    grant.actorId.toUpperCase(),
    { reviewerPassword: password },
  );
  const hash = sql.match(/N'(scrypt\$[\w-]+\$[\w-]+)'/)[1];
  assert.equal(await new PasswordHasher().verify(password, hash), true);
  assert.equal(sql.includes(password), false);
  assert.ok(sql.includes(grant.actorId));
  assert.ok(sql.includes("u.NormalizedUsername = N'STERILE.REVIEWER.TEST'"));
  assert.ok(sql.includes("i.Status = N'ACTIVE'"));
  assert.equal((sql.match(/UPDATE \[/g) || []).length, 1);
  assert.ok(sql.includes("UPDATE [Authentication].[Credentials]"));
  assert.ok(sql.includes("@@ROWCOUNT <> 1"));
  assert.ok(sql.includes("ROLLBACK"));
  assert.equal(
    /CREATE\s|DELETE\s|INSERT\s|GRANT\s|SET Status|SET LockedUntil/i.test(sql),
    false,
  );
  assert.deepEqual(grant, before);
});
test("reset refuses mismatched identities, operator grants, scope changes and malformed or short replacement input", async () => {
  const { c, grant } = await fixture(),
    input = { reviewerPassword: "New reviewer test password 12345" };
  for (const g of [
    { ...grant, actorId: randomUUID() },
    { ...grant, tenantId: randomUUID() },
    { ...grant, personId: "bad" },
    { ...grant, status: "DISABLED" },
    {
      ...grant,
      facilities: [
        { facilityId: c.facilityId, permissions: ["processing:write"] },
      ],
    },
    {
      ...grant,
      facilities: [
        { facilityId: randomUUID(), permissions: ["processing:inspect"] },
      ],
    },
  ])
    await assert.rejects(() =>
      prepareReviewerPasswordReset(c, g, grant.actorId, input),
    );
  for (const body of [
    {},
    { reviewerPassword: "short" },
    { ...input, actorId: randomUUID() },
    { reviewerPassword: "x".repeat(129) },
    { reviewerPassword: "x".repeat(21) + "\n" },
  ])
    await assert.rejects(() =>
      prepareReviewerPasswordReset(c, grant, grant.actorId, body),
    );
  await assert.rejects(() =>
    prepareReviewerPasswordReset(
      { ...c, tenantId: randomUUID() },
      grant,
      grant.actorId,
      input,
    ),
  );
});
test("reset CLI rejects incomplete invocation without printing password input", () => {
  const password = "Do not print reset password 123456";
  const r = spawnSync(
    process.execPath,
    [
      "scripts/sterile-account-prepare-reviewer-reset.mjs",
      "--config",
      "relative",
    ],
    { input: JSON.stringify({ reviewerPassword: password }), encoding: "utf8" },
  );
  assert.equal(r.status, 1);
  assert.equal((r.stdout + r.stderr).includes(password), false);
  assert.ok(r.stderr.includes("No SQL connection was opened"));
});
