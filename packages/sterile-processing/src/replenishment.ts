import {
  scopeOf,
  type SterileScope,
  type SterileRepository,
} from "./foundation.js";
import { consumableAlert } from "./consumable-alerts.js";
import type { ConsumableLot } from "./consumables.js";
export interface ReplenishmentRow {
  lotId: string;
  code: string;
  kind: ConsumableLot["kind"];
  name: string;
  lotNumber: string;
  supplier: string;
  supplierReference: string;
  expiresOn: string;
  available: number;
  minimumStock: number;
  targetStock: number | null;
  suggestedQuantity: number | null;
  stockRecorded: boolean;
  status: "suggested" | "target_not_set" | "expired";
}
export interface ReplenishmentReport {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  unit: "each";
  items: ReplenishmentRow[];
}
export class ReplenishmentRegistry {
  constructor(private readonly repository: SterileRepository) {}
  async get(scope: SterileScope): Promise<ReplenishmentReport> {
    const s = scopeOf(scope);
    return this.repository.transaction(s, async (tx) => {
      const generatedAt = new Date().toISOString(),
        items: ReplenishmentRow[] = [];
      for (let page = 1; ; page++) {
        const lots = await tx.listConsumables(page);
        for (const lot of lots.slice(0, 50)) {
          const alert = consumableAlert(
            lot,
            await tx.findConsumableStock(lot.id),
            generatedAt,
          );
          if (!alert?.lowStock) continue;
          items.push({
            lotId: lot.id,
            code: lot.code,
            kind: lot.kind,
            name: lot.name,
            lotNumber: lot.lotNumber,
            supplier: lot.supplier,
            supplierReference: lot.supplierReference,
            expiresOn: lot.expiresOn,
            available: alert.available,
            minimumStock: alert.minimumStock!,
            targetStock: alert.targetStock ?? null,
            suggestedQuantity: alert.suggestedQuantity,
            stockRecorded: alert.stockRecorded,
            status:
              lot.expiresOn < generatedAt.slice(0, 10)
                ? "expired"
                : alert.targetStock == null
                  ? "target_not_set"
                  : "suggested",
          });
        }
        if (lots.length <= 50) break;
      }
      items.sort(
        (a, b) =>
          a.supplier.localeCompare(b.supplier) ||
          a.code.localeCompare(b.code) ||
          a.lotId.localeCompare(b.lotId),
      );
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        generatedAt,
        unit: "each",
        items,
      };
    });
  }
}
