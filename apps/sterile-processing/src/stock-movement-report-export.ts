import type { StockMovementReport } from "@intrusionshield/sterile-processing";
import { csvCell } from "./trace-export.ts";
export function stockMovementReportCsv(r: StockMovementReport): string {
  const rows: unknown[][] = [
    [
      "tenant_id",
      "facility_id",
      "snapshot_utc",
      "from_day_utc_inclusive",
      "to_day_utc_exclusive",
      "movement_id",
      "recorded_at_utc",
      "unit",
      "lot_id",
      "lot_code",
      "product",
      "manufacturer_lot",
      "supplier",
      "action",
      "quantity",
      "available_change",
      "available_after",
      "received_total_after",
      "net_adjustments_after",
      "used_after",
      "quarantined_after",
      "discarded_after",
      "stock_version",
      "package_id",
      "package_code",
      "stock_count_id",
      "reason",
      "evidence_reference",
      "actor_id",
      "parent_request_id",
    ],
  ];
  for (const x of r.items)
    rows.push([
      r.tenantId,
      r.facilityId,
      r.generatedAt,
      r.from,
      r.to,
      x.id,
      x.at,
      x.unit,
      x.lotId,
      x.lotCode,
      x.product,
      x.manufacturerLot,
      x.supplier,
      x.action,
      x.quantity,
      x.availableDelta,
      x.balance.available,
      x.balance.received,
      x.balance.adjustments ?? 0,
      x.balance.used,
      x.balance.quarantined,
      x.balance.discarded,
      x.version,
      x.packageId,
      x.packageCode,
      x.stockCountId,
      x.reason,
      x.reference,
      x.actorId,
      x.parentRequestId,
    ]);
  return (
    "\ufeff" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
