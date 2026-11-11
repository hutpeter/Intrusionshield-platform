import { test } from "node:test";
import assert from "node:assert/strict";
import { stockBalanceReportCsv } from "../src/stock-balance-report-export.ts";
test("balance CSV preserves all snapshot rows, signed adjustments, untracked blanks and spreadsheet-safe text", () => {
  const item = {
      lotId: "lot",
      code: "LOT",
      kind: "wrap",
      name: 'Wrap "special"',
      lotNumber: "M1",
      supplier: "=FORMULA",
      supplierReference: "REF\nLINE",
      expiresOn: "2099-01-01",
      stockRecorded: true,
      withdrawn: false,
      received: 10,
      used: 0,
      quarantined: 0,
      discarded: 0,
      adjustments: -2,
      available: 8,
      usable: 8,
      stockVersion: 2,
      lastMovementAt: "2026-11-10T12:00:00Z",
      status: "current",
    },
    r = {
      tenantId: "tenant",
      facilityId: "facility",
      filters: { lotCode: null, status: null },
      generatedAt: "2026-11-11T12:00:00Z",
      unit: "each",
      items: Array.from({ length: 53 }, (_, i) => ({
        ...item,
        lotId: "lot-" + i,
        code: "LOT-" + i,
      })),
    };
  const csv = stockBalanceReportCsv(r);
  assert.equal(csv.match(/"current"/g).length, 53);
  assert.ok(csv.includes('"LOT-52"'));
  assert.ok(csv.includes('"\'=FORMULA"'));
  assert.ok(csv.includes('"Wrap ""special"""'));
  assert.ok(csv.includes('"REF\nLINE"'));
  assert.ok(csv.includes('"net_adjustments","available","usable"'));
  assert.ok(csv.includes('"\'-2","8","8","2"'));
  assert.ok(csv.includes(r.generatedAt));
  assert.ok(csv.includes('"filter_lot_code","filter_status"'));
  assert.ok(
    stockBalanceReportCsv({
      ...r,
      filters: { lotCode: "LOT", status: "current" },
      items: [item],
    }).includes('"LOT","current"\r\n'),
  );
  r.items = [
    {
      ...item,
      stockRecorded: false,
      stockVersion: null,
      lastMovementAt: null,
      received: 0,
      adjustments: 0,
      available: 0,
      usable: 0,
      status: "untracked",
    },
  ];
  assert.ok(stockBalanceReportCsv(r).includes('"0","0","","","untracked"'));
  assert.equal(
    stockBalanceReportCsv({ ...r, items: [] }).split("\r\n").length,
    2,
  );
});
