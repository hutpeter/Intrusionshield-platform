import {
  SterileError,
  type SterileScope,
  type SterileRepository,
} from "./foundation.js";
import {
  StockBalanceReportRegistry,
  type StockBalanceReportRow,
} from "./stock-balance-report.js";
export interface ConsumableExpiryRow {
  balance: StockBalanceReportRow;
  daysToExpiry: number;
  status: "expired" | "expiring";
}
export interface ConsumableExpiryReport {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  unit: "each";
  asOfDay: string;
  throughDay: string;
  horizonDays: number;
  items: ConsumableExpiryRow[];
}
const dayMs = 86400000;
export class ConsumableExpiryReportRegistry {
  constructor(private readonly repository: SterileRepository) {}
  async get(
    scope: SterileScope,
    horizonDays = 30,
  ): Promise<ConsumableExpiryReport> {
    if (
      !Number.isSafeInteger(horizonDays) ||
      horizonDays < 1 ||
      horizonDays > 365
    )
      throw new SterileError("INVALID_REQUEST");
    const snapshot = await new StockBalanceReportRegistry(this.repository).get(
        scope,
      ),
      asOfDay = snapshot.generatedAt.slice(0, 10),
      throughDay = new Date(Date.parse(asOfDay) + horizonDays * dayMs)
        .toISOString()
        .slice(0, 10),
      items: ConsumableExpiryRow[] = [];
    for (const balance of snapshot.items) {
      if (
        !balance.stockRecorded ||
        balance.available + balance.quarantined <= 0 ||
        balance.expiresOn > throughDay
      )
        continue;
      const daysToExpiry =
        (Date.parse(balance.expiresOn) - Date.parse(asOfDay)) / dayMs;
      items.push({
        balance,
        daysToExpiry,
        status: daysToExpiry < 0 ? "expired" : "expiring",
      });
    }
    items.sort(
      (a, b) =>
        a.balance.expiresOn.localeCompare(b.balance.expiresOn) ||
        a.balance.code.localeCompare(b.balance.code) ||
        a.balance.lotId.localeCompare(b.balance.lotId),
    );
    return {
      tenantId: snapshot.tenantId,
      facilityId: snapshot.facilityId,
      generatedAt: snapshot.generatedAt,
      unit: "each",
      asOfDay,
      throughDay,
      horizonDays,
      items,
    };
  }
}
