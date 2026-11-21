import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validAccessView } from "../src/access-view.ts";
import { accessText, permissionLabel } from "../src/access-text.ts";
import { sterilePermissions } from "../../../services/sterile-processing/dist/security/access.js";
test("refuses malformed, foreign, duplicate and unknown-permission access views", () => {
  const facilityId = randomUUID(),
    view = {
      facilityId,
      permissions: ["instruments:read"],
      users: [
        {
          actorId: randomUUID(),
          displayName: "Test user",
          version: 1,
          accountActive: true,
          personMapped: true,
          self: false,
          capabilityEnabled: true,
          permissions: ["instruments:read"],
        },
      ],
    };
  assert.equal(validAccessView(view, facilityId), true);
  assert.equal(validAccessView(view, randomUUID()), false);
  assert.equal(validAccessView(null, facilityId), false);
  assert.equal(validAccessView({ ...view, users: [null] }, facilityId), false);
  assert.equal(
    validAccessView(
      { ...view, users: [view.users[0], view.users[0]] },
      facilityId,
    ),
    false,
  );
  assert.equal(
    validAccessView(
      {
        ...view,
        users: [{ ...view.users[0], permissions: ["access:manage"] }],
      },
      facilityId,
    ),
    false,
  );
  assert.equal(
    validAccessView(
      { ...view, users: [{ ...view.users[0], self: "false" }] },
      facilityId,
    ),
    false,
  );
});
test("provides readable permission names and administrator boundaries in all supported languages", () => {
  for (const language of ["en", "es", "fr"]) {
    for (const permission of sterilePermissions) {
      const label = permissionLabel(permission, language);
      assert.ok(label);
      assert.ok(!label.includes("undefined"));
      assert.notEqual(label, permission);
    }
    for (const text of Object.values(accessText[language]))
      assert.equal(typeof text, "string");
    assert.ok(accessText[language].self);
    assert.ok(accessText[language].grantAdmin);
  }
});
