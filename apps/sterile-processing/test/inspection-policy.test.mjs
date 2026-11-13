import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inspectionBlock,
  independentInspectionText,
} from "../src/inspection-policy.ts";
const episode = {
  attempts: [
    {
      startedBy: "cleaner",
      finishedBy: "finisher",
      startedByPersonId: "person-a",
      finishedByPersonId: "person-b",
    },
  ],
};
test("inspection guidance recognizes both cleaning participants and aliases, without treating permissions as independence", () => {
  for (const session of [
    { actorId: "cleaner", personId: "other" },
    { actorId: "finisher", personId: "other" },
    { actorId: "alias", personId: "person-a" },
    { actorId: "alias", personId: "person-b" },
  ])
    assert.equal(inspectionBlock(episode, session), "SELF_INSPECTION");
  assert.equal(
    inspectionBlock(episode, { actorId: "independent", personId: "person-c" }),
    null,
  );
  assert.equal(
    inspectionBlock(
      { attempts: [{ startedBy: "old", finishedBy: "old" }] },
      { actorId: "independent", personId: "person-c" },
    ),
    "INSPECTION_IDENTITY_REQUIRED",
  );
});
test("all earlier retry participants remain excluded and guidance is available in every UI language", () => {
  const retried = {
    attempts: [
      ...episode.attempts,
      {
        startedBy: "new",
        finishedBy: "new",
        startedByPersonId: "person-d",
        finishedByPersonId: "person-d",
      },
    ],
  };
  assert.equal(
    inspectionBlock(retried, { actorId: "alias", personId: "person-a" }),
    "SELF_INSPECTION",
  );
  for (const text of Object.values(independentInspectionText))
    assert.ok(text.trim());
});
