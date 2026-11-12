import type { ReplenishmentReport } from "@intrusionshield/sterile-processing";
import { csvCell } from "./trace-export.ts";
export function replenishmentCsv(
  r: ReplenishmentReport,
  supplierFilter?: string,
): string {
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
      "available",
      "minimum",
      "target",
      "suggested_quantity",
      "planning_status",
      ...(supplierFilter === undefined ? [] : ["filter_supplier"]),
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
      x.available,
      x.minimumStock,
      x.targetStock,
      x.suggestedQuantity,
      x.status,
      ...(supplierFilter === undefined ? [] : [supplierFilter]),
    ]);
  return (
    "\ufeff" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
