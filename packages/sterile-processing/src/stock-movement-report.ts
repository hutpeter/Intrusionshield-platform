import {
  scopeOf,
  SterileError,
  type SterileScope,
  type SterileRepository,
} from "./foundation.js";
import type { StockMovement } from "./consumable-stock.js";
export interface StockMovementReportRow extends StockMovement {
  lotCode: string;
  product: string;
  supplier: string;
  manufacturerLot: string;
  availableDelta: number;
}
export interface StockMovementReport {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  from: string;
  to: string;
  unit: "each";
  items: StockMovementReportRow[];
}
const dayMs = 86400000;
function validDay(s: string) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export class StockMovementReportRegistry {
  constructor(private readonly repository: SterileRepository) {}
  async report(
    scope: SterileScope,
    from: string,
    to: string,
  ): Promise<StockMovementReport> {
    const s = scopeOf(scope);
    if (
      !validDay(from) ||
      !validDay(to) ||
      from >= to ||
      Date.parse(to) - Date.parse(from) > 90 * dayMs ||
      Date.parse(to) > Math.floor(Date.now() / dayMs) * dayMs + dayMs
    )
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      const generatedAt = new Date().toISOString(),
        start = from + "T00:00:00.000Z",
        end = to + "T00:00:00.000Z",
        items: StockMovementReportRow[] = [];
      for (let page = 1; ; page++) {
        const lots = await tx.listConsumables(page);
        for (const lot of lots.slice(0, 50)) {
          for (let movementPage = 1; ; movementPage++) {
            const movements = await tx.listConsumableStockMovements(
              lot.id,
              movementPage,
            );
            for (const m of movements.slice(0, 50))
              if (m.at >= start && m.at < end)
                items.push({
                  ...m,
                  lotCode: lot.code,
                  product: lot.name,
                  supplier: lot.supplier,
                  manufacturerLot: lot.lotNumber,
                  availableDelta:
                    m.action === "receive" || m.action === "adjustment"
                      ? m.quantity
                      : m.action === "discard_quarantined"
                        ? 0
                        : -m.quantity,
                });
            if (movements.length <= 50) break;
          }
        }
        if (lots.length <= 50) break;
      }
      items.sort(
        (a, b) =>
          a.at.localeCompare(b.at) ||
          a.lotCode.localeCompare(b.lotCode) ||
          a.version - b.version ||
          a.id.localeCompare(b.id),
      );
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        generatedAt,
        from,
        to,
        unit: "each",
        items,
      };
    });
  }
}
