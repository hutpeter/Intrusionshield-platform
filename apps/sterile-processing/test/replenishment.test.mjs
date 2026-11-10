import { test } from "node:test";
import assert from "node:assert/strict";
import { replenishmentCsv } from "../src/replenishment-export.ts";
test("replenishment CSV exports every frozen row, scope, missing suggestions and spreadsheet-safe supplier text", () => {
  const snapshot = "2026-11-10T19:00:00Z",
    item = {
      lotId: "lot",
      code: "LOT",
      kind: "wrap",
      name: 'Wrap "special"',
      lotNumber: "M1",
      supplier: "=FORMULA",
      supplierReference: "Delivery\nreference",
      expiresOn: "2099-01-01",
      available: 5,
      minimumStock: 10,
      targetStock: 20,
      suggestedQuantity: 15,
      stockRecorded: true,
      status: "suggested",
    };
  const report = {
    tenantId: "tenant",
    facilityId: "facility",
    generatedAt: snapshot,
    unit: "each",
    items: Array.from({ length: 53 }, (_, i) => ({
      ...item,
      lotId: "lot-" + i,
      code: "LOT-" + i,
    })),
  };
  const csv = replenishmentCsv(report);
  assert.equal(csv.match(/"suggested"/g).length, 53);
  assert.ok(csv.includes('"LOT-52"'));
  assert.ok(csv.includes('"\'=FORMULA"'));
  assert.ok(csv.includes('"Wrap ""special"""'));
  assert.ok(csv.includes('"Delivery\nreference"'));
  assert.ok(csv.includes(snapshot));
  assert.ok(csv.includes('"5","10","20","15"'));
  report.items = [
    {
      ...item,
      targetStock: null,
      suggestedQuantity: null,
      status: "target_not_set",
    },
  ];
  assert.ok(replenishmentCsv(report).includes('"10","","","target_not_set"'));
  assert.equal(
    replenishmentCsv({ ...report, items: [] }).split("\r\n").length,
    2,
  );
});
