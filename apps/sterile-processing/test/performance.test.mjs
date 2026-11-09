import { test } from "node:test";
import assert from "node:assert/strict";
import { performanceCsv } from "../src/performance-export.ts";
test("performance CSV freezes the displayed period, quotes formulas and keeps missing samples blank", () => {
  const r = {
    tenantId: "tenant",
    facilityId: "facility",
    from: "2026-11-01",
    to: "2026-11-03",
    generatedAt: "2026-11-03T12:00:00.000Z",
    groupingTimeZone: "UTC",
    totals: { received: 1 },
    daily: [{ day: "2026-11-01", received: 1 }],
    quality: { cleaningFailureRate: null },
    timing: { cleaning: { samples: 0, meanMinutes: null } },
    types: [
      {
        id: "type",
        code: "SAFE",
        name: '=HYPERLINK("x")\nName',
        received: 1,
        cleaning: 0,
        inspectionPassed: 0,
        assembly: 0,
        packaging: 0,
        cycles: 0,
      },
    ],
    equipment: [],
    backlog: [{ queue: "cleaning", total: 3 }],
    oldest: [
      {
        queue: "cleaning",
        id: "record",
        code: "@command",
        updatedAt: "2026-11-01T00:00:00.000Z",
        ageMinutes: 3600,
      },
    ],
    exclusions: { invalidTimingPairs: 1 },
  };
  const before = JSON.stringify(r),
    csv = performanceCsv(r);
  assert.match(csv, /"from","","2026-11-01"/);
  assert.match(csv, /"Exclusive UTC end day"/);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")\nName"'));
  assert.ok(csv.includes('"\'@command"'));
  assert.ok(csv.includes('"timing","","cleaning","meanMinutes","","minutes"'));
  assert.equal(JSON.stringify(r), before);
});
