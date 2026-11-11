import {
  codeOf,
  SterileError,
  type SterileScope,
  type SterileRepository,
} from "./foundation.js";
import {
  StockBalanceReportRegistry,
  type StockBalanceReportRow,
} from "./stock-balance-report.js";
export type ConsumableExpiryStatus = "expired" | "expiring";
export interface ConsumableExpiryFilters {
  lotCode?: string;
  status?: ConsumableExpiryStatus;
}
export interface ConsumableExpiryRow {
  balance: StockBalanceReportRow;
  daysToExpiry: number;
  status: ConsumableExpiryStatus;
}
export interface ConsumableExpiryReport {
  filters: { lotCode: string | null; status: ConsumableExpiryStatus | null };
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
    filters: ConsumableExpiryFilters = {},
  ): Promise<ConsumableExpiryReport> {
    if (
      !Number.isSafeInteger(horizonDays) ||
      horizonDays < 1 ||
      horizonDays > 365
    )
      throw new SterileError("INVALID_REQUEST");
    if (
      !filters ||
      typeof filters !== "object" ||
      Array.isArray(filters) ||
      Object.keys(filters).some((k) => !["lotCode", "status"].includes(k)) ||
      (filters.status !== undefined &&
        !["expired", "expiring"].includes(filters.status))
    )
      throw new SterileError("INVALID_REQUEST");
    const lotCode =
        filters.lotCode === undefined ? null : codeOf(filters.lotCode),
      selectedStatus = filters.status ?? null;
    const snapshot = await new StockBalanceReportRegistry(this.repository).get(
        scope,
        lotCode === null ? {} : { lotCode },
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
      const status = daysToExpiry < 0 ? "expired" : "expiring";
      if (selectedStatus !== null && status !== selectedStatus) continue;
      items.push({ balance, daysToExpiry, status });
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
      filters: { lotCode, status: selectedStatus },
      items,
    };
  }
}
