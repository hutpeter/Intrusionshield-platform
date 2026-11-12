import type { ReplenishmentReport } from "@intrusionshield/sterile-processing";
import { replenishmentCsv } from "./replenishment-export.ts";
type Row = ReplenishmentReport["items"][number];
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function supplierReplenishmentGroups(
  items: readonly Row[],
): { supplier: string; items: Row[] }[] {
  const groups = new Map<string, Row[]>();
  for (const item of items) {
    const rows = groups.get(item.supplier) ?? [];
    rows.push(item);
    groups.set(item.supplier, rows);
  }
  return [...groups]
    .sort(([a], [b]) => compare(a, b))
    .map(([supplier, rows]) => ({
      supplier,
      items: rows.sort(
        (a, b) => compare(a.code, b.code) || compare(a.lotId, b.lotId),
      ),
    }));
}
export function supplierReplenishmentCsv(report: ReplenishmentReport): string {
  return replenishmentCsv({
    ...report,
    items: supplierReplenishmentGroups(report.items).flatMap(
      (group) => group.items,
    ),
  });
}
