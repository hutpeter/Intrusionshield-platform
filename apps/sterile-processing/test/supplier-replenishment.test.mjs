import { test } from "node:test";
import assert from "node:assert/strict";
import {
  supplierReplenishmentGroups,
  supplierReplenishmentCsv,
} from "../src/supplier-replenishment.ts";
const item = {
  lotId: "id",
  code: "LOT",
  kind: "wrap",
  name: "Wrap",
  lotNumber: "M1",
  supplier: "Vendor",
  supplierReference: "REF",
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
  generatedAt: "2026-11-12T10:00:00Z",
  unit: "each",
  items: [],
};
test("supplier grouping keeps exact recorded names separate and orders lots without mutating a frozen snapshot", () => {
  const rows = [
    { ...item, lotId: "b", code: "B", supplier: "Vendor" },
    { ...item, lotId: "lower", supplier: "vendor" },
    { ...item, lotId: "trailing", supplier: "Vendor " },
    { ...item, lotId: "a", code: "A", supplier: "Vendor" },
    { ...item, lotId: "proto", supplier: "__proto__" },
  ];
  const original = structuredClone(rows);
  rows.forEach(Object.freeze);
  Object.freeze(rows);
  const groups = supplierReplenishmentGroups(rows);
  assert.deepEqual(
    groups.map((g) => g.supplier),
    ["Vendor", "Vendor ", "__proto__", "vendor"],
  );
  assert.deepEqual(
    groups[0].items.map((x) => x.lotId),
    ["a", "b"],
  );
  assert.equal(groups.flatMap((g) => g.items).length, 5);
  assert.deepEqual(rows, original);
  assert.equal(groups[0].items[0], rows[3]);
});
test("per-lot suggestions, missing targets and expired statuses survive grouping without aggregation", () => {
  const rows = [
    { ...item, lotId: "one", suggestedQuantity: 15 },
    {
      ...item,
      lotId: "two",
      code: "LOT2",
      name: "Different product",
      suggestedQuantity: 40,
      targetStock: 45,
    },
    {
      ...item,
      lotId: "missing",
      code: "LOT3",
      targetStock: null,
      suggestedQuantity: null,
      status: "target_not_set",
    },
    {
      ...item,
      lotId: "expired",
      code: "LOT4",
      expiresOn: "2026-01-01",
      suggestedQuantity: null,
      status: "expired",
    },
  ];
  const group = supplierReplenishmentGroups(rows)[0];
  assert.equal(group.items.length, 4);
  assert.deepEqual(
    group.items.map((x) => x.suggestedQuantity),
    [15, 40, null, null],
  );
  assert.equal(Object.hasOwn(group, "total"), false);
  const csv = supplierReplenishmentCsv({ ...report, items: rows });
  assert.ok(csv.includes('"target_not_set"'));
  assert.ok(csv.includes('"expired"'));
  assert.ok(csv.includes('"10","","","target_not_set"'));
  assert.ok(csv.includes('"5","10","45","40"'));
});
test("supplier CSV includes the entire saved scope and all suppliers beyond the screen page with safe literal fields", () => {
  const rows = Array.from({ length: 53 }, (_, i) => ({
    ...item,
    lotId: "id-" + i,
    code: "CODE-" + String(i).padStart(2, "0"),
    supplier: i % 2 ? "Z Vendor" : "=FORMULA",
    name: 'Wrap "special"',
    supplierReference: "Ref\nLine",
  })).reverse();
  const snapshot = { ...report, items: rows };
  const original = structuredClone(snapshot);
  const csv = supplierReplenishmentCsv(snapshot);
  assert.equal(csv.split("\r\n").length, 55);
  assert.ok(csv.includes('"CODE-52"'));
  assert.ok(csv.indexOf('"CODE-00"') < csv.indexOf('"CODE-01"'));
  assert.equal(csv.match(/2026-11-12T10:00:00Z/g).length, 53);
  assert.ok(csv.includes('"\'=FORMULA"'));
  assert.ok(csv.includes('"Wrap ""special"""'));
  assert.ok(csv.includes('"Ref\nLine"'));
  assert.equal(csv.match(/"15"/g).length, 53);
  assert.deepEqual(snapshot, original);
  assert.equal(supplierReplenishmentCsv(report).split("\r\n").length, 2);
  assert.deepEqual(supplierReplenishmentGroups([]), []);
});
