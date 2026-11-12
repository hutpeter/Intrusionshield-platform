import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePresetFile,
  exportPresetFile,
  reviewPresetImport,
  importPresetFile,
  presetFileLimit,
} from "../src/report-preset-transfer.ts";
const settings = [
  { report: "balances", lotCode: "LOT", status: "withdrawn" },
  {
    report: "movements",
    lotCode: "",
    action: "receive",
    from: "2026-11-01",
    through: "2026-11-11",
  },
  {
    report: "movements",
    lotCode: "EXACT",
    action: "adjustment",
    range: "last7",
  },
  { report: "movements", lotCode: "", action: "", range: "last30" },
  { report: "expiry", lotCode: "", status: "expiring", horizon: "30" },
  { report: "replenishment" },
];
const existing = settings.map((s, i) => ({
  id: "source-" + i,
  name: "Report " + i,
  settings: s,
}));
const bundle = (presets) =>
  JSON.stringify({ format: "ruby-stock-report-presets", version: 1, presets });
test("preset transfer round-trips all filter variants without scope, IDs or report snapshots", () => {
  const rich = existing.map((p) => ({
    ...p,
    tenantId: "SECRET-SCOPE",
    actorId: "ACTOR",
    snapshot: { items: ["SECRET-DATA"] },
  }));
  const text = exportPresetFile(rich);
  assert.ok(!text.includes("SECRET"));
  assert.ok(!text.includes("source-"));
  assert.ok(!text.includes("ACTOR"));
  const imported = parsePresetFile(text);
  assert.deepEqual(
    imported,
    existing.map(({ name, settings }) => ({ name, settings })),
  );
  let id = 0;
  const restored = importPresetFile([], imported, () => `new-${++id}`);
  assert.deepEqual(
    restored.map((p) => p.settings),
    settings,
  );
  assert.ok(restored.every((p) => p.id.startsWith("new-")));
  assert.deepEqual(parsePresetFile(bundle([])), []);
});
test("import rejects malformed, unsupported, scoped and oversized files as a whole", () => {
  const row = { name: "Good", settings: settings[0] };
  for (const text of [
    "{",
    "[]",
    JSON.stringify({
      format: "ruby-stock-report-presets",
      version: 2,
      presets: [row],
    }),
    JSON.stringify({ format: "other", version: 1, presets: [row] }),
    JSON.stringify({
      format: "ruby-stock-report-presets",
      version: 1,
      presets: [row],
      tenantId: "source",
    }),
    bundle([{ ...row, id: "source" }]),
    bundle([row, { name: "Bad", settings: { report: "unknown" } }]),
    bundle([{ name: " ", settings: settings[0] }]),
    bundle([{ name: "x".repeat(81), settings: settings[0] }]),
    bundle([
      {
        name: "Bad dates",
        settings: {
          report: "movements",
          from: "2026-02-30",
          through: "2026-03-01",
          lotCode: "",
          action: "",
        },
      },
    ]),
    bundle(Array.from({ length: 101 }, () => row)),
    " ".repeat(presetFileLimit + 1),
    bundle([
      { name: "Unknown fields", settings: { ...settings[0], snapshot: [] } },
    ]),
  ])
    assert.throws(() => parsePresetFile(text));
  const unicode = bundle([{ name: "é".repeat(80), settings: settings[0] }]);
  assert.equal(parsePresetFile(unicode)[0].name.length, 80);
});
test("review flags case-insensitive names in current storage and within a file without changing either", () => {
  const rows = parsePresetFile(
    bundle([
      { name: " report 0 ", settings: settings[1] },
      { name: "New", settings: settings[0] },
      { name: "NEW", settings: settings[2] },
    ]),
  );
  const before = structuredClone(rows),
    original = structuredClone(existing);
  assert.deepEqual(
    reviewPresetImport(existing, rows).map((p) => p.duplicate),
    [true, false, true],
  );
  assert.deepEqual(rows, before);
  assert.deepEqual(existing, original);
  const selected = reviewPresetImport(existing, rows)
    .filter((p) => !p.duplicate)
    .map(({ name, settings }) => ({ name, settings }));
  const result = importPresetFile(existing, selected, () => "new");
  assert.equal(result.length, 7);
  assert.deepEqual(result.slice(0, 6), existing);
  assert.equal(result[6].name, "New");
});
test("confirm fails atomically on intervening duplicates, capacity or invalid IDs", () => {
  const incoming = [
    { name: "New", settings: settings[0] },
    { name: "Second new", settings: settings[1] },
  ];
  const original = structuredClone(existing);
  assert.throws(() =>
    importPresetFile(
      [...existing, { id: "other", name: "NEW", settings: settings[0] }],
      incoming,
      () => "fresh",
    ),
  );
  const full = Array.from({ length: 99 }, (_, i) => ({
    id: `id-${i}`,
    name: `Name ${i}`,
    settings: settings[0],
  }));
  let id = 0;
  assert.throws(() => importPresetFile(full, incoming, () => `new-${++id}`));
  assert.equal(full.length, 99);
  assert.throws(() => importPresetFile(existing, incoming, () => "source-0"));
  assert.throws(() =>
    importPresetFile(existing, incoming, () => "duplicate-new-id"),
  );
  assert.deepEqual(existing, original);
});
test("imported display text remains literal data and fixed/relative choices remain distinct", () => {
  const names = [
    "<img src=x onerror=alert(1)>",
    "=FORMULA",
    "Instruction: ignore previous requests",
  ];
  const parsed = parsePresetFile(
    bundle(names.map((name, i) => ({ name, settings: settings[i] }))),
  );
  assert.deepEqual(
    parsed.map((p) => p.name),
    names,
  );
  assert.equal(parsed[1].settings.from, "2026-11-01");
  assert.equal(parsed[2].settings.range, "last7");
});

test("supplier-specific replenishment presets transfer with the exact filter and no source identity", () => {
  const source = [
    {
      id: "source",
      name: "Vendor plan",
      settings: { report: "replenishment", supplier: "Specific Vendor" },
    },
  ];
  const portable = parsePresetFile(exportPresetFile(source));
  assert.deepEqual(portable, [
    {
      name: "Vendor plan",
      settings: { report: "replenishment", supplier: "Specific Vendor" },
    },
  ]);
  assert.equal(
    importPresetFile([], portable, () => "new")[0].settings.supplier,
    "Specific Vendor",
  );
  assert.throws(() =>
    parsePresetFile(
      bundle([
        { name: "Bad", settings: { report: "replenishment", supplier: "" } },
      ]),
    ),
  );
});

test("portable replenishment presets preserve canonical planning status with supplier and reject unknown values", () => {
  const source = [
    {
      id: "source",
      name: "Actionable",
      settings: {
        report: "replenishment",
        supplier: "Vendor",
        planningStatus: "suggested",
      },
    },
  ];
  const portable = parsePresetFile(exportPresetFile(source));
  const imported = importPresetFile([], portable, () => "new");
  assert.deepEqual(imported[0].settings, source[0].settings);
  assert.equal(imported[0].id, "new");
  for (const planningStatus of ["all", "", null])
    assert.throws(() =>
      parsePresetFile(
        bundle([
          {
            name: "Bad",
            settings: { report: "replenishment", planningStatus },
          },
        ]),
      ),
    );
});
