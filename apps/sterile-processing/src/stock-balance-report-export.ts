import type { StockBalanceReport } from "@intrusionshield/sterile-processing";
import { csvCell } from "./trace-export.ts";
export function stockBalanceReportCsv(r: StockBalanceReport): string {
  const rows: unknown[][] = [
    [
      "tenant_id",
      "facility_id",
      "snapshot_utc",
      "unit",
      "lot_id",
      "lot_code",
      "consumable_type",
      "product",
      "manufacturer_lot",
      "supplier",
      "supplier_reference",
      "expiry_day_utc",
      "stock_recorded",
      "withdrawn",
      "received",
      "used",
      "quarantined",
      "discarded",
      "net_adjustments",
      "available",
      "usable",
      "stock_version",
      "last_movement_utc",
      "recorded_status",
    ],
  ];
  for (const x of r.items)
    rows.push([
      r.tenantId,
      r.facilityId,
      r.generatedAt,
      r.unit,
      x.lotId,
      x.code,
      x.kind,
      x.name,
      x.lotNumber,
      x.supplier,
      x.supplierReference,
      x.expiresOn,
      x.stockRecorded,
      x.withdrawn,
      x.received,
      x.used,
      x.quarantined,
      x.discarded,
      x.adjustments,
      x.available,
      x.usable,
      x.stockVersion,
      x.lastMovementAt,
      x.status,
    ]);
  return (
    "\ufeff" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
