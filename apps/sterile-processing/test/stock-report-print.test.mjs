import { test } from "node:test";
import assert from "node:assert/strict";
import {
  replenishmentPrintModel,
  stockBalancePrintModel,
  stockMovementPrintModel,
  consumableExpiryPrintModel,
} from "../src/stock-report-print-model.ts";
const base = {
    tenantId: "tenant",
    facilityId: "facility",
    generatedAt: "2026-11-11T12:00:00Z",
    unit: "each",
  },
  row = {
    lotId: "lot",
    code: "LOT",
    kind: "wrap",
    name: "<script>literal</script>",
    lotNumber: "M1",
    supplier: "Supplier",
    supplierReference: "REF\nLINE",
    expiresOn: "2026-11-13",
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
  };
test("all four print models retain complete snapshot rows and applied scope/filters, beyond the displayed page", () => {
  const balances = {
      ...base,
      filters: { lotCode: null, status: null },
      items: Array.from({ length: 53 }, (_, i) => ({
        ...row,
        lotId: "lot-" + i,
        code: "LOT-" + i,
      })),
    },
    before = structuredClone(balances),
    b = stockBalancePrintModel(balances, "en", "Facility");
  assert.equal(b.records.length, 53);
  assert.equal(b.records.at(-1).title, "LOT-52");
  assert.ok(b.metadata.some(([k, v]) => v === base.generatedAt));
  assert.ok(b.metadata.some(([k, v]) => v === base.tenantId));
  assert.ok(b.records[0].fields.some(([k, v]) => v === -2));
  assert.deepEqual(balances, before);
  const replen = {
    ...base,
    items: balances.items.map((x) => ({
      ...x,
      minimumStock: 10,
      targetStock: 20,
      suggestedQuantity: 12,
      status: "suggested",
    })),
  };
  assert.equal(replenishmentPrintModel(replen, "en").records.length, 53);
  const movements = {
    ...base,
    from: "2026-11-01",
    to: "2026-11-12",
    filters: { lotCode: "LOT", action: "adjustment" },
    items: Array.from({ length: 53 }, (_, i) => ({
      id: "movement-" + i,
      lotId: "lot",
      lotCode: "LOT",
      action: "adjustment",
      at: base.generatedAt,
      quantity: -2,
      availableDelta: -2,
      balance: row,
      version: 2,
      product: row.name,
      manufacturerLot: "M1",
      supplier: "Supplier",
      packageId: null,
      packageCode: null,
      stockCountId: "count",
      reason: "Reason\nsecond line",
      reference: "REF",
      actorId: "reviewer",
      parentRequestId: "request",
    })),
  };
  const m = stockMovementPrintModel(movements, "en");
  assert.equal(m.records.length, 53);
  assert.ok(m.metadata.some(([k, v]) => v === "2026-11-11"));
  assert.ok(m.metadata.some(([k, v]) => v === "Approved count adjustment"));
  assert.ok(m.records[0].fields.some(([k, v]) => v === "count"));
  const expiry = {
    ...base,
    asOfDay: "2026-11-11",
    throughDay: "2026-12-11",
    horizonDays: 30,
    filters: { lotCode: "LOT", status: "expiring" },
    items: balances.items.map((balance) => ({
      balance,
      daysToExpiry: 2,
      status: "expiring",
    })),
  };
  const e = consumableExpiryPrintModel(expiry, "en");
  assert.equal(e.records.length, 53);
  assert.ok(e.metadata.some(([k, v]) => v === 30));
  assert.ok(e.metadata.some(([k, v]) => v === "Approaching expiry"));
  assert.ok(e.records[0].fields.some(([k, v]) => v === 2));
});
test("empty print models preserve selected filters/window, and localized labels retain literal source text and missing values", () => {
  const empty = {
    ...base,
    filters: { lotCode: "UNKNOWN", status: "withdrawn" },
    items: [],
  };
  const e = stockBalancePrintModel(empty, "fr");
  assert.equal(e.records.length, 0);
  assert.ok(e.metadata.some(([k, v]) => v === "UNKNOWN"));
  assert.ok(e.metadata.some(([k, v]) => v === "Retiré"));
  const report = {
    ...base,
    filters: { lotCode: null, status: null },
    items: [
      {
        ...row,
        stockVersion: null,
        lastMovementAt: null,
        stockRecorded: false,
        received: 0,
        adjustments: 0,
        available: 0,
        usable: 0,
        status: "untracked",
      },
    ],
  };
  for (const language of ["en", "es", "fr"]) {
    const model = stockBalancePrintModel(report, language);
    assert.ok(model.records[0].fields.some(([k, v]) => v === row.name));
    assert.ok(model.records[0].fields.some(([k, v]) => v === false));
    assert.ok(model.records[0].fields.some(([k, v]) => v === null));
    assert.ok(model.metadata.some(([k, v]) => v === 1));
  }
});
