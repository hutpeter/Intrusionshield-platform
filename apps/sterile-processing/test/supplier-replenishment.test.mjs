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

test("supplier filter is exact, immutable and uses the full saved snapshot", async () => {
  const { filterSupplierReplenishment } =
    await import("../src/supplier-replenishment.ts");
  const snapshot = {
    ...report,
    items: Array.from({ length: 53 }, (_, i) => ({
      ...item,
      lotId: "id" + i,
      code: "LOT" + i,
      supplier: i === 52 ? "Vendor" : "vendor",
    })),
  };
  const copy = structuredClone(snapshot);
  const selected = filterSupplierReplenishment(snapshot, "Vendor");
  assert.equal(selected.items.length, 1);
  assert.equal(selected.items[0].lotId, "id52");
  assert.equal(selected.generatedAt, snapshot.generatedAt);
  assert.equal(selected.facilityId, snapshot.facilityId);
  assert.equal(filterSupplierReplenishment(snapshot, "").items.length, 53);
  assert.equal(
    filterSupplierReplenishment(snapshot, "missing").items.length,
    0,
  );
  assert.equal(
    filterSupplierReplenishment(snapshot, "Vendor ").items.length,
    0,
  );
  assert.deepEqual(snapshot, copy);
});
test("filtered CSV includes only selected supplier rows with preserved statuses and safe filter metadata", () => {
  const snapshot = {
    ...report,
    items: [
      { ...item, lotId: "first", supplier: "=Vendor" },
      { ...item, lotId: "second", code: "OTHER", supplier: "Other" },
      {
        ...item,
        lotId: "third",
        code: "NO-TARGET",
        supplier: "=Vendor",
        targetStock: null,
        suggestedQuantity: null,
        status: "target_not_set",
      },
    ],
  };
  const csv = supplierReplenishmentCsv(snapshot, "=Vendor");
  assert.equal(csv.split("\r\n").length, 4);
  assert.ok(csv.includes('"filter_supplier"'));
  assert.ok(!csv.includes('"OTHER"'));
  assert.ok(csv.includes('"target_not_set","\'=Vendor"'));
  assert.ok(csv.includes('"15","suggested","\'=Vendor"'));
  assert.ok(csv.includes(report.generatedAt));
  assert.equal(
    supplierReplenishmentCsv(snapshot, "missing").split("\r\n").length,
    2,
  );
  assert.equal(supplierReplenishmentCsv(snapshot, "").split("\r\n").length, 5);
});

test("planning status intersects exact supplier selection without changing snapshot values", async () => {
  const { filterSupplierReplenishment } =
    await import("../src/supplier-replenishment.ts");
  const snapshot = {
    ...report,
    items: [
      { ...item, lotId: "suggested" },
      {
        ...item,
        lotId: "missing",
        targetStock: null,
        suggestedQuantity: null,
        status: "target_not_set",
      },
      {
        ...item,
        lotId: "expired",
        expiresOn: "2000-01-01",
        suggestedQuantity: null,
        status: "expired",
      },
      { ...item, lotId: "other", supplier: "Other" },
    ],
  };
  const copy = structuredClone(snapshot);
  for (const status of ["suggested", "target_not_set", "expired"]) {
    const selected = filterSupplierReplenishment(snapshot, "Vendor", status);
    assert.equal(selected.items.length, 1);
    assert.equal(selected.items[0].status, status);
    assert.equal(selected.generatedAt, snapshot.generatedAt);
  }
  assert.equal(
    filterSupplierReplenishment(snapshot, "", "suggested").items.length,
    2,
  );
  assert.equal(
    filterSupplierReplenishment(snapshot, "Other", "expired").items.length,
    0,
  );
  assert.equal(
    filterSupplierReplenishment(snapshot, "Vendor", "").items.length,
    3,
  );
  assert.deepEqual(snapshot, copy);
});
test("combined-filter CSV contains every matching lot and explicit canonical supplier/status metadata", () => {
  const snapshot = {
    ...report,
    items: Array.from({ length: 54 }, (_, i) => ({
      ...item,
      lotId: "id" + i,
      code: "LOT" + i,
      ...(i < 52
        ? {}
        : {
            supplier: "Other",
            status: "expired",
            expiresOn: "2000-01-01",
            suggestedQuantity: null,
          }),
    })),
  };
  const csv = supplierReplenishmentCsv(snapshot, "Vendor", "suggested");
  assert.equal(csv.split("\r\n").length, 54);
  assert.ok(csv.includes('"filter_supplier","filter_planning_status"'));
  assert.ok(csv.includes('"LOT51"'));
  assert.ok(!csv.includes('"LOT52"'));
  assert.equal(csv.match(/"Vendor","suggested"/g).length, 52);
  const expired = supplierReplenishmentCsv(snapshot, "Other", "expired");
  assert.equal(expired.split("\r\n").length, 4);
  assert.ok(expired.includes('"","expired","Other","expired"'));
  assert.equal(
    supplierReplenishmentCsv(snapshot, "Vendor", "expired").split("\r\n")
      .length,
    2,
  );
  assert.equal(
    supplierReplenishmentCsv(snapshot, "", "").split("\r\n").length,
    56,
  );
});

test("status summary counts full-snapshot lots by selected supplier, including rows beyond pagination", async () => {
  const { replenishmentStatusCounts } =
    await import("../src/supplier-replenishment.ts");
  const snapshot = {
    ...report,
    items: Array.from({ length: 53 }, (_, i) => ({
      ...item,
      lotId: "id" + i,
      code: "LOT" + i,
      supplier: i === 52 ? "Other" : "Vendor",
      status: i === 52 ? "expired" : i === 51 ? "target_not_set" : "suggested",
      targetStock: i === 51 ? null : 20,
      suggestedQuantity: i < 51 ? 15 : null,
    })),
  };
  const original = structuredClone(snapshot);
  assert.deepEqual(replenishmentStatusCounts(snapshot), {
    suggested: 51,
    target_not_set: 1,
    expired: 1,
  });
  assert.deepEqual(replenishmentStatusCounts(snapshot, "Vendor"), {
    suggested: 51,
    target_not_set: 1,
    expired: 0,
  });
  assert.deepEqual(replenishmentStatusCounts(snapshot, "Other"), {
    suggested: 0,
    target_not_set: 0,
    expired: 1,
  });
  assert.deepEqual(snapshot, original);
});
test("summary uses exact supplier names and counts lots rather than suggested quantities", async () => {
  const { replenishmentStatusCounts } =
    await import("../src/supplier-replenishment.ts");
  const snapshot = {
    ...report,
    items: [
      { ...item, lotId: "one", supplier: "Vendor", suggestedQuantity: 15 },
      { ...item, lotId: "two", supplier: "Vendor", suggestedQuantity: 1000000 },
      {
        ...item,
        lotId: "case",
        supplier: "vendor",
        status: "target_not_set",
        targetStock: null,
        suggestedQuantity: null,
      },
      {
        ...item,
        lotId: "space",
        supplier: "Vendor ",
        status: "expired",
        targetStock: null,
        suggestedQuantity: null,
      },
    ],
  };
  assert.deepEqual(replenishmentStatusCounts(snapshot, "Vendor"), {
    suggested: 2,
    target_not_set: 0,
    expired: 0,
  });
  assert.deepEqual(replenishmentStatusCounts(snapshot, "vendor"), {
    suggested: 0,
    target_not_set: 1,
    expired: 0,
  });
  assert.deepEqual(replenishmentStatusCounts(snapshot, "Vendor "), {
    suggested: 0,
    target_not_set: 0,
    expired: 1,
  });
});
test("empty or absent supplier summaries return three explicit zero counts without altering frozen rows", async () => {
  const { replenishmentStatusCounts } =
    await import("../src/supplier-replenishment.ts");
  const zero = { suggested: 0, target_not_set: 0, expired: 0 };
  assert.deepEqual(replenishmentStatusCounts(report), zero);
  const snapshot = Object.freeze({
    ...report,
    items: Object.freeze([Object.freeze({ ...item })]),
  });
  assert.deepEqual(replenishmentStatusCounts(snapshot, "missing"), zero);
  assert.deepEqual(replenishmentStatusCounts(snapshot), {
    suggested: 1,
    target_not_set: 0,
    expired: 0,
  });
});
