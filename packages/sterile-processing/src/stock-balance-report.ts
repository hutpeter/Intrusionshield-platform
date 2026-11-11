import {
  scopeOf,
  type SterileScope,
  type SterileRepository,
} from "./foundation.js";
import type { ConsumableLot } from "./consumables.js";
export interface StockBalanceReportRow {
  lotId: string;
  code: string;
  kind: ConsumableLot["kind"];
  name: string;
  lotNumber: string;
  supplier: string;
  supplierReference: string;
  expiresOn: string;
  stockRecorded: boolean;
  withdrawn: boolean;
  received: number;
  used: number;
  quarantined: number;
  discarded: number;
  adjustments: number;
  available: number;
  usable: number;
  stockVersion: number | null;
  lastMovementAt: string | null;
  status: "current" | "untracked" | "expired" | "withdrawn";
}
export interface StockBalanceReport {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  unit: "each";
  items: StockBalanceReportRow[];
}
export class StockBalanceReportRegistry {
  constructor(private readonly repository: SterileRepository) {}
  async get(scope: SterileScope): Promise<StockBalanceReport> {
    const s = scopeOf(scope);
    return this.repository.transaction(s, async (tx) => {
      const generatedAt = new Date().toISOString(),
        today = generatedAt.slice(0, 10),
        items: StockBalanceReportRow[] = [];
      for (let page = 1; ; page++) {
        const lots = await tx.listConsumables(page);
        for (const lot of lots.slice(0, 50)) {
          const stock = await tx.findConsumableStock(lot.id),
            withdrawn = !!lot.withdrawal,
            status = withdrawn
              ? "withdrawn"
              : lot.expiresOn < today
                ? "expired"
                : !stock
                  ? "untracked"
                  : "current";
          items.push({
            lotId: lot.id,
            code: lot.code,
            kind: lot.kind,
            name: lot.name,
            lotNumber: lot.lotNumber,
            supplier: lot.supplier,
            supplierReference: lot.supplierReference,
            expiresOn: lot.expiresOn,
            stockRecorded: !!stock,
            withdrawn,
            received: stock?.received ?? 0,
            used: stock?.used ?? 0,
            quarantined: stock?.quarantined ?? 0,
            discarded: stock?.discarded ?? 0,
            adjustments: stock?.adjustments ?? 0,
            available: stock?.available ?? 0,
            usable: status === "current" ? (stock?.available ?? 0) : 0,
            stockVersion: stock?.version ?? null,
            lastMovementAt: stock?.updatedAt ?? null,
            status,
          });
        }
        if (lots.length <= 50) break;
      }
      items.sort(
        (a, b) =>
          a.code.localeCompare(b.code) || a.lotId.localeCompare(b.lotId),
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
