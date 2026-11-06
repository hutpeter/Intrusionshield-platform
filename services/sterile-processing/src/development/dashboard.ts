import type { DatabaseSync } from "node:sqlite";
import type {
  DashboardQueueId,
  DashboardRow,
} from "@intrusionshield/sterile-processing";
/** Static predicates only: identifiers or filters never come from caller SQL. */
export function readDashboardQueue(
  db: DatabaseSync,
  args: string[],
  id: DashboardQueueId,
  offset = 0,
): { total: number; items: DashboardRow[] } {
  const state = "json_extract(p.payload,'$.state')",
    same = (alias: string) =>
      `${alias}.tenant_id=p.tenant_id AND ${alias}.facility_id=p.facility_id`,
    pending = `EXISTS(SELECT 1 FROM sp_recall_instruments ri WHERE ${same("ri")} AND ri.recall_id=p.id AND NOT EXISTS(SELECT 1 FROM sp_recall_readmissions rm WHERE rm.tenant_id=ri.tenant_id AND rm.facility_id=ri.facility_id AND rm.instrument_id=ri.instrument_id AND rm.recall_id=ri.recall_id))`;
  const configs: Record<DashboardQueueId, [string, string, string]> = {
    cleaning: [
      "sp_processing",
      `${state} IN ('received','cleaning_failed','inspection_failed')`,
      "json_array_length(p.payload,'$.instruments')",
    ],
    inspection: [
      "sp_processing",
      `${state}='awaiting_inspection'`,
      "json_array_length(p.payload,'$.instruments')",
    ],
    assembly: [
      "sp_assemblies",
      `${state}='draft'`,
      "json_array_length(p.payload,'$.instruments')",
    ],
    loading: [
      "sp_packages",
      `${state}='packaged' AND EXISTS(SELECT 1 FROM sp_package_assignments a WHERE ${same("a")} AND a.package_id=p.id) AND NOT EXISTS(SELECT 1 FROM sp_load_assignments a WHERE ${same("a")} AND a.package_id=p.id) AND NOT EXISTS(SELECT 1 FROM sp_returns a WHERE ${same("a")} AND a.package_id=p.id) AND NOT EXISTS(SELECT 1 FROM sp_recall_blocks a WHERE ${same("a")} AND a.package_id=p.id)`,
      "json_array_length(p.payload,'$.assemblySnapshot.instruments')",
    ],
    release: [
      "sp_loads",
      `${state}='awaiting_review' AND json_extract(p.payload,'$.outcome')='passed' AND NOT EXISTS(SELECT 1 FROM sp_reviews r WHERE ${same("r")} AND r.load_id=p.id AND r.state IN ('released','rejected'))`,
      "json_array_length(p.payload,'$.packages')",
    ],
    returns: ["sp_returns", `${state} IN ('returned','discrepancy')`, "1"],
    recall: [
      "sp_recalls",
      `(${state}='open' OR ${pending})`,
      "json_array_length(p.payload,'$.items')",
    ],
    maintenance: ["sp_instruments", `${state}='maintenance'`, "1"],
  };
  const [table, where, units] = configs[id],
    filter = `FROM ${table} p WHERE p.tenant_id=? AND p.facility_id=? AND (${where})`,
    updated =
      "coalesce(json_extract(p.payload,'$.updatedAt'),json_extract(p.payload,'$.createdAt'))";
  const total = (
    db.prepare(`SELECT count(*) AS n ${filter}`).get(...args) as { n: number }
  ).n;
  const items = db
    .prepare(
      `SELECT p.id,p.code,${state} AS state,${updated} AS updatedAt,${units} AS units ${filter} ORDER BY ${updated} ASC,p.id ASC LIMIT 12 OFFSET ?`,
    )
    .all(...args, offset) as unknown as DashboardRow[];
  return { total, items };
}
