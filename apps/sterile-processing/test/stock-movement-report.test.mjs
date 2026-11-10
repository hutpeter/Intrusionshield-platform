import { test } from "node:test";
import assert from "node:assert/strict";
import { stockMovementReportCsv } from "../src/stock-movement-report-export.ts";
test("movement CSV exports frozen scope/dates, all rows, signed adjustment and saved balances with safe text", () => {
  const item = {
      id: "movement",
      at: "2026-11-10T12:00:00.000Z",
      unit: "each",
      lotId: "lot",
      lotCode: "LOT",
      product: 'Wrap "special"',
      manufacturerLot: "M1",
      supplier: "=FORMULA",
      action: "adjustment",
      quantity: -2,
      availableDelta: -2,
      balance: {
        available: 8,
        received: 10,
        adjustments: -2,
        used: 0,
        quarantined: 0,
        discarded: 0,
      },
      version: 2,
      stockCountId: "count",
      packageId: null,
      packageCode: null,
      reason: "Count\nreview",
      reference: "REF",
      actorId: "reviewer",
      parentRequestId: "request",
    },
    r = {
      tenantId: "tenant",
      facilityId: "facility",
      generatedAt: "2026-11-10T13:00:00.000Z",
      from: "2026-11-01",
      to: "2026-11-11",
      unit: "each",
      items: Array.from({ length: 53 }, (_, i) => ({
        ...item,
        id: "movement-" + i,
      })),
    };
  const csv = stockMovementReportCsv(r);
  assert.equal(csv.match(/"adjustment"/g).length, 53);
  assert.ok(csv.includes('"movement-52"'));
  assert.ok(csv.includes('"\'=FORMULA"'));
  assert.ok(csv.includes('"Wrap ""special"""'));
  assert.ok(csv.includes('"Count\nreview"'));
  assert.ok(csv.includes('"\'-2","\'-2","8","10","\'-2"'));
  assert.ok(csv.includes('"count"'));
  assert.ok(csv.includes(r.generatedAt));
  assert.ok(csv.includes(r.to));
  assert.equal(
    stockMovementReportCsv({ ...r, items: [] }).split("\r\n").length,
    2,
  );
});
