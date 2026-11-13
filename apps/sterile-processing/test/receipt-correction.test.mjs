import { test } from "node:test";
import assert from "node:assert/strict";
import {
  receiptCanBeCorrected,
  receiptHasChanges,
  receiptCorrectionText,
} from "../src/receipt-correction.ts";
const record = {
  state: "received",
  attempts: [],
  inspections: [],
  source: "Démo",
  custodian: "Person",
  condition: "Used",
  discrepancies: "",
};
test("correction affordance is limited to receipts before any cleaning or inspection", () => {
  assert.equal(receiptCanBeCorrected(record), true);
  for (const state of [
    "cleaning",
    "cleaning_failed",
    "awaiting_inspection",
    "inspection_failed",
    "ready_for_assembly",
    "superseded",
  ])
    assert.equal(receiptCanBeCorrected({ ...record, state }), false);
  assert.equal(receiptCanBeCorrected({ ...record, attempts: [{}] }), false);
  assert.equal(receiptCanBeCorrected({ ...record, inspections: [{}] }), false);
});
test("no-op correction detection matches normalized text and all languages explain retained holds", () => {
  assert.equal(
    receiptHasChanges(record, { ...record, source: " De\u0301mo " }),
    false,
  );
  assert.equal(
    receiptHasChanges(record, { ...record, source: "Different" }),
    true,
  );
  for (const text of Object.values(receiptCorrectionText))
    for (const key of [
      "title",
      "reason",
      "reference",
      "confirm",
      "save",
      "boundary",
      "history",
    ])
      assert.ok(text[key]?.trim());
});
