import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, traceCsv } from "../src/trace-export.ts";
test("CSV neutralizes spreadsheet formulas and preserves quotes, newlines and Unicode", () => {
  for (const x of [
    '=HYPERLINK("bad")',
    "+1+1",
    "-1+1",
    "@SUM(A1)",
    "  =1",
    "\tmalicious",
    "\rmalicious",
  ])
    assert.ok(csvCell(x).startsWith("\"'"));
  assert.equal(csvCell('Pinza "curva"\nEspaña'), '"Pinza ""curva""\nEspaña"');
});
test("CSV exports all saved versions, links, facts, events, blocks and report scope without mutating snapshot", () => {
  const report = {
    tenantId: "tenant",
    facilityId: "facility",
    generatedAt: "2026-11-04T00:00:00Z",
    root: { kind: "package", code: "PACK", id: "p", version: 1 },
    nodes: [
      {
        kind: "package",
        id: "p",
        code: "PACK",
        version: 1,
        state: "packaged",
        snapshots: [
          {
            version: 1,
            current: true,
            fields: [{ key: "material", value: "Español" }],
            facts: [
              {
                kind: "inspection",
                at: "date",
                actorId: "actor",
                fields: [{ key: "evidence", value: "safe" }],
              },
            ],
          },
          { version: 0, current: false, fields: [], facts: [] },
        ],
      },
    ],
    links: [
      {
        fromKind: "package",
        fromId: "p",
        fromVersion: 1,
        toKind: "assembly",
        toId: "a",
        toVersion: 3,
        relation: "packaged_from",
        targetAvailable: false,
      },
    ],
    events: [
      {
        id: "event",
        entityId: "p",
        version: 1,
        at: "date",
        actorId: "actor",
        action: "package-created",
        reason: "=1+1",
      },
    ],
    alerts: [
      {
        kind: "return_block",
        entityKind: "package",
        entityId: "p",
        code: "PACK",
        reference: "RETURN",
      },
    ],
    coverage: "recorded-links-only",
  };
  const before = structuredClone(report),
    csv = traceCsv(report, {
      headers: [
        "Section",
        "Type",
        "Code",
        "Version",
        "State",
        "At",
        "Actor",
        "Details",
        "From",
        "To",
        "Relation",
      ],
      word: (x) => x,
      kind: (x) => x,
      actor: (x) => x,
    });
  assert.ok(csv.startsWith("\uFEFF"));
  for (const value of [
    "tenant",
    "facility",
    "historical",
    "Español",
    "inspection",
    "packaged_from",
    "RETURN",
    "package-created",
  ])
    assert.ok(csv.includes(value), value);
  assert.deepEqual(report, before);
});
