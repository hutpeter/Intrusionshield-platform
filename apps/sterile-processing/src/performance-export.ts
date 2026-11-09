import type { PerformanceReport } from "@intrusionshield/sterile-processing";
import { csvCell } from "./trace-export.ts";
/** Export the displayed report object, without fetching newer data. Stable keys; RFC 4180. */
export function performanceCsv(r: PerformanceReport): string {
  const rows: unknown[][] = [
      ["section", "day_or_code", "name_or_key", "metric", "value", "unit"],
    ],
    add = (...cells: unknown[]) => rows.push(cells);
  for (const key of [
    "tenantId",
    "facilityId",
    "from",
    "to",
    "generatedAt",
    "groupingTimeZone",
  ] as const)
    add("report", "", key, "", r[key], "");
  add("definition", "", "to", "", "Exclusive UTC end day", "");
  add(
    "definition",
    "",
    "activity",
    "",
    "Recorded stage events; instrument rows count repeated occurrences",
    "",
  );
  add(
    "definition",
    "",
    "timing",
    "",
    "Completed valid non-negative recorded timestamp pairs; no samples is blank",
    "",
  );
  add(
    "definition",
    "",
    "equipment",
    "",
    "Merged recorded run intervals; only explicit status revisions define out-of-service time",
    "",
  );
  add(
    "definition",
    "",
    "waiting",
    "",
    "Current queues at generatedAt; independent of activity date filter; age since last update",
    "",
  );
  for (const [k, v] of Object.entries(r.totals))
    add("totals", "", "", k, v, "events");
  for (const row of r.daily)
    for (const [k, v] of Object.entries(row))
      if (k !== "day") add("daily", row.day, "", k, v, "events");
  for (const [k, v] of Object.entries(r.quality))
    add("quality", "", "", k, v, k.endsWith("Rate") ? "ratio" : "events");
  for (const [k, row] of Object.entries(r.timing))
    for (const [metric, v] of Object.entries(row))
      add(
        "timing",
        "",
        k,
        metric,
        v,
        metric === "samples" ? "samples" : "minutes",
      );
  for (const row of r.types)
    for (const key of [
      "received",
      "cleaning",
      "inspectionPassed",
      "assembly",
      "packaging",
      "cycles",
    ] as const)
      add(
        "instrument_type",
        row.code,
        row.name,
        key,
        row[key],
        "instrument occurrences",
      );
  for (const row of r.equipment) {
    add("equipment", row.code, row.name, "identity", row.link, "");
    for (const key of [
      "cleaningStarts",
      "cycleStarts",
      "finishedRuns",
      "recordedRunMinutes",
      "outOfServiceMinutes",
    ] as const)
      add(
        "equipment",
        row.code,
        row.name,
        key,
        row[key],
        key.endsWith("Minutes") ? "minutes" : "events",
      );
  }
  for (const row of r.backlog)
    add("current_queue", "", row.queue, "total", row.total, "records");
  for (const row of r.oldest) {
    add("oldest", row.code, row.queue, "updatedAt", row.updatedAt, "");
    add("oldest", row.code, row.queue, "ageMinutes", row.ageMinutes, "minutes");
  }
  for (const [k, v] of Object.entries(r.exclusions))
    add("exclusions", "", "", k, v, "records_or_pairs");
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
