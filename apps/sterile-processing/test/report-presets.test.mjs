import { test } from "node:test";
import assert from "node:assert/strict";
import {
  presetScope,
  validSettings,
  readPresets,
  addPreset,
  updatePreset,
  movementWindow,
} from "../src/report-presets.ts";
const balance = { report: "balances", lotCode: "LOT", status: "withdrawn" };
test("presets are isolated by tenant, facility and actor; missing scope is rejected", () => {
  const scope = { tenantId: "t", facilityId: "f", actorId: "a" },
    key = presetScope(scope);
  for (const field of Object.keys(scope))
    assert.notEqual(key, presetScope({ ...scope, [field]: "other" }));
  assert.throws(() => presetScope({ tenantId: "t", facilityId: "f" }));
  const data = new Map([
      [key, JSON.stringify(addPreset([], "Withdrawn", balance, "p1"))],
    ]),
    storage = { getItem: (k) => data.get(k) ?? null };
  assert.equal(readPresets(storage, key).length, 1);
  assert.deepEqual(
    readPresets(storage, presetScope({ ...scope, actorId: "other" })),
    [],
  );
});
test("all four filter types validate; impossible dates, ranges and unsupported filters fail closed", () => {
  for (const settings of [
    balance,
    { report: "replenishment" },
    { report: "expiry", horizon: "30", lotCode: "", status: "expiring" },
    {
      report: "movements",
      from: "2026-11-01",
      through: "2026-11-11",
      lotCode: "",
      action: "adjustment",
    },
  ])
    assert.equal(validSettings(settings), true);
  for (const settings of [
    { ...balance, status: "all" },
    { ...balance, lotCode: "x".repeat(101) },
    { report: "expiry", horizon: "0", lotCode: "", status: "" },
    { report: "expiry", horizon: "366", lotCode: "", status: "" },
    {
      report: "movements",
      from: "2026-02-30",
      through: "2026-03-01",
      lotCode: "",
      action: "",
    },
    {
      report: "movements",
      from: "2026-11-11",
      through: "2026-11-01",
      lotCode: "",
      action: "",
    },
    {
      report: "movements",
      from: "2026-01-01",
      through: "2026-04-01",
      lotCode: "",
      action: "",
    },
    { report: "replenishment", snapshot: { items: [] } },
  ])
    assert.equal(validSettings(settings), false);
});
test("round trip stores filters, rejects duplicate names and malformed storage without silently replacing data", () => {
  const first = addPreset([], "  Withdrawn  ", balance, "p1");
  assert.equal(first[0].name, "Withdrawn");
  assert.throws(() => addPreset(first, "WITHDRAWN", balance, "p2"));
  assert.throws(() => addPreset(first, "   ", balance, "p2"));
  assert.throws(() => addPreset(first, "x".repeat(81), balance, "p2"));
  const getItem = () => JSON.stringify(first);
  assert.deepEqual(readPresets({ getItem }, "key"), first);
  for (const raw of [
    "{",
    "{}",
    JSON.stringify([...first, ...first]),
    JSON.stringify([{ ...first[0], settings: { report: "unknown" } }]),
  ])
    assert.throws(() => readPresets({ getItem: () => raw }, "key"));
  assert.throws(() =>
    readPresets(
      {
        getItem() {
          throw Error("blocked");
        },
      },
      "key",
    ),
  );
  assert.throws(() =>
    addPreset(
      Array.from({ length: 100 }, (_, i) => ({
        ...first[0],
        id: "p" + i,
        name: "n" + i,
      })),
      "More",
      balance,
      "p101",
    ),
  );
});

test("relative movement windows use inclusive UTC days across midnight, leap years and month/year boundaries", () => {
  const base = { report: "movements", lotCode: "EXACT", action: "adjustment" };
  for (const [now, range, from, through] of [
    ["2026-11-11T23:59:59.999Z", "last7", "2026-11-05", "2026-11-11"],
    ["2026-11-12T00:00:00.000Z", "last7", "2026-11-06", "2026-11-12"],
    ["2026-01-01T00:30:00.000Z", "last30", "2025-12-03", "2026-01-01"],
    ["2024-03-01T00:00:00.000Z", "last7", "2024-02-24", "2024-03-01"],
    ["2026-11-11T23:30:00-05:00", "last30", "2026-10-14", "2026-11-12"],
  ]) {
    const settings = { ...base, range };
    assert.equal(validSettings(settings), true);
    assert.deepEqual(movementWindow(settings, Date.parse(now)), {
      from,
      through,
    });
  }
  const fixed = { ...base, from: "2026-01-01", through: "2026-01-07" };
  assert.deepEqual(movementWindow(fixed, Date.parse("2027-01-01")), {
    from: fixed.from,
    through: fixed.through,
  });
});
test("legacy fixed and relative presets round trip together without storing resolved dates", () => {
  const fixed = {
    report: "movements",
    lotCode: "",
    action: "",
    from: "2026-11-01",
    through: "2026-11-11",
  };
  const relative = {
    report: "movements",
    lotCode: "LOT",
    action: "receive",
    range: "last30",
  };
  const saved = addPreset(
    addPreset([], "Fixed", fixed, "fixed"),
    "Rolling",
    relative,
    "rolling",
  );
  assert.deepEqual(
    readPresets({ getItem: () => JSON.stringify(saved) }, "key"),
    saved,
  );
  assert.deepEqual(Object.keys(saved[1].settings).sort(), [
    "action",
    "lotCode",
    "range",
    "report",
  ]);
  for (const settings of [
    { ...relative, range: "last90" },
    { ...relative, range: 7 },
    { ...relative, from: "2026-01-01" },
    { ...fixed, range: "last7" },
    { ...relative, action: "unsupported" },
  ])
    assert.equal(validSettings(settings), false);
});

test("editing preserves identity, position and other presets, supports rename and fixed/relative changes", () => {
  const old = {
    id: "movement",
    name: "Week",
    settings: { report: "movements", lotCode: "", action: "", range: "last7" },
  };
  const other = { id: "balance", name: "Balances", settings: balance };
  const original = [other, old];
  const copy = structuredClone(original);
  const settings = {
    report: "movements",
    lotCode: "EXACT",
    action: "adjustment",
    from: "2026-11-01",
    through: "2026-11-05",
  };
  const updated = updatePreset(original, old, " Month review ", settings);
  assert.deepEqual(updated, [
    other,
    { id: "movement", name: "Month review", settings },
  ]);
  assert.deepEqual(original, copy);
  assert.deepEqual(
    updatePreset(updated, updated[1], "Month review", {
      ...old.settings,
      range: "last30",
    })[1].settings,
    { ...old.settings, range: "last30" },
  );
  // An update is allowed when the collection is already at the creation limit.
  const full = Array.from({ length: 100 }, (_, i) => ({
    ...other,
    id: "id" + i,
    name: "name" + i,
  }));
  assert.equal(updatePreset(full, full[50], "Renamed", balance).length, 100);
});
test("editing rejects conflicting names, changed/deleted records, invalid settings and report-type changes", () => {
  const old = { id: "one", name: "First", settings: balance },
    other = {
      id: "two",
      name: "Second",
      settings: { report: "replenishment" },
    };
  for (const [entries, name, settings] of [
    [[old, other], "second", balance],
    [[old, other], "  ", balance],
    [[old, other], "x".repeat(81), balance],
    [[other], "New", balance],
    [[{ ...old, name: "Changed" }, other], "New", balance],
    [
      [{ ...old, settings: { ...balance, status: "current" } }, other],
      "New",
      balance,
    ],
    [[old, other], "New", { report: "replenishment" }],
    [[old, other], "New", { ...balance, status: "unsupported" }],
  ])
    assert.throws(() => updatePreset(entries, old, name, settings));
});

test("replenishment presets retain an optional exact supplier while legacy All suppliers definitions remain valid", () => {
  for (const settings of [
    { report: "replenishment" },
    { report: "replenishment", supplier: "DEMO-SUPPLIER" },
    { report: "replenishment", supplier: "Vendor " },
    { report: "replenishment", supplier: "x".repeat(200) },
  ]) {
    assert.equal(validSettings(settings), true);
    const presets = addPreset([], "Planning", settings, "id");
    assert.deepEqual(
      readPresets({ getItem: () => JSON.stringify(presets) }, "key"),
      presets,
    );
  }
  for (const settings of [
    { report: "replenishment", supplier: "" },
    { report: "replenishment", supplier: " " },
    { report: "replenishment", supplier: 3 },
    { report: "replenishment", supplier: "x".repeat(201) },
    { report: "replenishment", supplier: "Vendor", extra: true },
  ])
    assert.equal(validSettings(settings), false);
});
