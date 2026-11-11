import { test } from "node:test";
import assert from "node:assert/strict";
import { consumableExpiryReportCsv } from "../src/consumable-expiry-report-export.ts";
test("expiry CSV exports every frozen row and UTC horizon with signed days, quarantine quantities and safe supplier text", () => {
  const balance = {
      lotId: "lot",
      code: "LOT",
      kind: "wrap",
      name: 'Wrap "special"',
      lotNumber: "M1",
      supplier: "=FORMULA",
      supplierReference: "REF\nLINE",
      expiresOn: "2026-11-10",
      available: 0,
      quarantined: 3,
      usable: 0,
      withdrawn: true,
      stockVersion: 2,
      lastMovementAt: "2026-11-09T12:00:00Z",
    },
    r = {
      tenantId: "tenant",
      facilityId: "facility",
      generatedAt: "2026-11-11T12:00:00Z",
      filters: { lotCode: null, status: null },
      asOfDay: "2026-11-11",
      throughDay: "2026-12-11",
      horizonDays: 30,
      unit: "each",
      items: Array.from({ length: 53 }, (_, i) => ({
        balance: { ...balance, lotId: "lot-" + i, code: "LOT-" + i },
        daysToExpiry: -1,
        status: "expired",
      })),
    };
  const csv = consumableExpiryReportCsv(r);
  assert.equal(csv.match(/"expired"/g).length, 53);
  assert.ok(csv.includes('"LOT-52"'));
  assert.ok(csv.includes('"\'=FORMULA"'));
  assert.ok(csv.includes('"Wrap ""special"""'));
  assert.ok(csv.includes('"REF\nLINE"'));
  assert.ok(csv.includes('"2026-11-11","2026-12-11","30"'));
  assert.ok(csv.includes('"\'-1","expired","0","3","0","true"'));
  assert.ok(csv.includes(r.generatedAt));
  assert.ok(csv.includes('"filter_lot_code","filter_expiry_status"'));
  assert.ok(
    consumableExpiryReportCsv({
      ...r,
      filters: { lotCode: "LOT", status: "expired" },
      items: [{ balance, daysToExpiry: -1, status: "expired" }],
    }).includes('"LOT","expired"\r\n'),
  );
  assert.equal(
    consumableExpiryReportCsv({ ...r, items: [] }).split("\r\n").length,
    2,
  );
});
