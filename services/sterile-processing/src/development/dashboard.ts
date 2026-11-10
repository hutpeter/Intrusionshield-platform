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
  if (id === "consumableAlerts") {
    const today = new Date().toISOString().slice(0, 10),
      available = "coalesce(json_extract(s.payload,'$.available'),0)",
      minimum = "json_extract(p.payload,'$.alertPolicy.minimumStock')",
      warning =
        "coalesce(json_extract(p.payload,'$.alertPolicy.warningDays'),7)",
      expires = "json_extract(p.payload,'$.expiresOn')",
      low = `(${minimum} IS NOT NULL AND ${available}<=${minimum})`,
      expiry = `(${available}>0 AND julianday(${expires})<=julianday(?) + ${warning})`,
      from = `FROM sp_consumables p LEFT JOIN sp_consumable_stock s ON s.tenant_id=p.tenant_id AND s.facility_id=p.facility_id AND s.lot_id=p.id WHERE p.tenant_id=? AND p.facility_id=? AND json_extract(p.payload,'$.withdrawal') IS NULL AND (${low} OR ${expiry})`,
      total = (
        db.prepare(`SELECT count(*) AS n ${from}`).get(...args, today) as {
          n: number;
        }
      ).n;
    const rows = db
      .prepare(
        `SELECT p.id,p.code, max(json_extract(p.payload,'$.createdAt'),coalesce(json_extract(p.payload,'$.alertPolicy.at'),json_extract(p.payload,'$.createdAt')),coalesce(json_extract(s.payload,'$.updatedAt'),json_extract(p.payload,'$.createdAt'))) AS updatedAt,${available} AS units,p.payload AS lot,s.payload AS stock ${from} ORDER BY ${expires} ASC,p.code ASC,p.id ASC LIMIT 12 OFFSET ?`,
      )
      .all(...args, today, offset) as {
      id: string;
      code: string;
      updatedAt: string;
      units: number;
      lot: string;
      stock: string | null;
    }[];
    return {
      total,
      items: rows.map((r) => {
        const lot = JSON.parse(r.lot),
          stock = r.stock ? JSON.parse(r.stock) : null,
          minimumStock = lot.alertPolicy?.minimumStock ?? null,
          warningDays = lot.alertPolicy?.warningDays ?? 7,
          days = (Date.parse(lot.expiresOn) - Date.parse(today)) / 86400000,
          lowStock = minimumStock !== null && r.units <= minimumStock,
          expiry =
            r.units > 0 && Number.isFinite(days) && days <= warningDays
              ? days < 0
                ? ("expired" as const)
                : ("expiring" as const)
              : ("current" as const);
        return {
          id: r.id,
          code: r.code,
          updatedAt: r.updatedAt,
          units: r.units,
          state: "consumable_alert",
          consumableAlert: {
            available: r.units,
            minimumStock,
            warningDays,
            expiresOn: lot.expiresOn,
            lowStock,
            expiry,
            stockRecorded: !!stock,
          },
        };
      }),
    };
  }
  const state = "json_extract(p.payload,'$.state')",
    same = (alias: string) =>
      `${alias}.tenant_id=p.tenant_id AND ${alias}.facility_id=p.facility_id`,
    pending = `EXISTS(SELECT 1 FROM sp_recall_instruments ri WHERE ${same("ri")} AND ri.recall_id=p.id AND NOT EXISTS(SELECT 1 FROM sp_recall_readmissions rm WHERE rm.tenant_id=ri.tenant_id AND rm.facility_id=ri.facility_id AND rm.instrument_id=ri.instrument_id AND rm.recall_id=ri.recall_id))`;
  const configs: Record<
    Exclude<DashboardQueueId, "consumableAlerts">,
    [string, string, string]
  > = {
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
      `${state}='packaged' AND NOT EXISTS(SELECT 1 FROM sp_package_integrity h WHERE ${same("h")} AND h.package_id=p.id) AND (json_extract(p.payload,'$.shelfLife.mode') IS NULL OR json_extract(p.payload,'$.shelfLife.mode')!='time_based' OR julianday(json_extract(p.payload,'$.shelfLife.expiresAt'))>julianday('now')) AND EXISTS(SELECT 1 FROM sp_package_assignments a WHERE ${same("a")} AND a.package_id=p.id) AND NOT EXISTS(SELECT 1 FROM sp_load_assignments a WHERE ${same("a")} AND a.package_id=p.id) AND NOT EXISTS(SELECT 1 FROM sp_returns a WHERE ${same("a")} AND a.package_id=p.id) AND NOT EXISTS(SELECT 1 FROM sp_recall_blocks a WHERE ${same("a")} AND a.package_id=p.id)`,
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
    packageAlerts: [
      "sp_packages",
      `${state}='packaged' AND NOT EXISTS(SELECT 1 FROM sp_returns r WHERE ${same("r")} AND r.package_id=p.id) AND (EXISTS(SELECT 1 FROM sp_package_integrity h WHERE ${same("h")} AND h.package_id=p.id) OR (json_extract(p.payload,'$.shelfLife.mode')='time_based' AND julianday(json_extract(p.payload,'$.shelfLife.expiresAt')) <= julianday('now')+json_extract(p.payload,'$.shelfLife.warningDays') AND NOT EXISTS(SELECT 1 FROM sp_distribution d WHERE ${same("d")} AND d.package_id=p.id AND json_extract(d.payload,'$.state')='issued')))`,
      "json_array_length(p.payload,'$.assemblySnapshot.instruments')",
    ],
    maintenance: [
      "sp_instruments",
      `(${state}='maintenance' OR (${state}='registered' AND NOT EXISTS(SELECT 1 FROM sp_loaners l WHERE ${same("l")} AND l.id=json_extract(p.payload,'$.externalOwnership.loanerId') AND json_extract(l.payload,'$.state')='returned') AND EXISTS(SELECT 1 FROM sp_service_usage u WHERE ${same("u")} AND u.instrument_id=p.id AND json_extract(u.payload,'$.interval') IS NOT NULL AND json_extract(u.payload,'$.totalRecorded')-json_extract(u.payload,'$.serviceBaseline')>=json_extract(u.payload,'$.interval'))))`,
      "1",
    ],
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
