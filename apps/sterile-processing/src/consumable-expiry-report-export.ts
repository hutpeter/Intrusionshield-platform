import type { ConsumableExpiryReport } from "@intrusionshield/sterile-processing";
import { csvCell } from "./trace-export.ts";
export function consumableExpiryReportCsv(r: ConsumableExpiryReport): string {
  const rows: unknown[][] = [
    [
      "tenant_id",
      "facility_id",
      "snapshot_utc",
      "as_of_day_utc",
      "through_day_utc_inclusive",
      "horizon_days",
      "unit",
      "lot_id",
      "lot_code",
      "consumable_type",
      "product",
      "manufacturer_lot",
      "supplier",
      "supplier_reference",
      "expiry_day_utc",
      "days_to_expiry",
      "expiry_status",
      "available",
      "quarantined",
      "usable",
      "withdrawn",
      "stock_version",
      "last_movement_utc",
    ],
  ];
  for (const x of r.items) {
    const b = x.balance;
    rows.push([
      r.tenantId,
      r.facilityId,
      r.generatedAt,
      r.asOfDay,
      r.throughDay,
      r.horizonDays,
      r.unit,
      b.lotId,
      b.code,
      b.kind,
      b.name,
      b.lotNumber,
      b.supplier,
      b.supplierReference,
      b.expiresOn,
      x.daysToExpiry,
      x.status,
      b.available,
      b.quarantined,
      b.usable,
      b.withdrawn,
      b.stockVersion,
      b.lastMovementAt,
    ]);
  }
  return (
    "\ufeff" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
