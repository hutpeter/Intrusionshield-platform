import type {
  ReplenishmentReport,
  StockBalanceReport,
  StockMovementReport,
  ConsumableExpiryReport,
} from "@intrusionshield/sterile-processing";
import type { Language } from "./text";
import { stockPrintLabels } from "./stock-report-print-text.ts";
import { replenishmentLabels } from "./replenishment-text.ts";
import { stockBalanceReportLabels } from "./stock-balance-report-text.ts";
import { stockMovementReportLabels } from "./stock-movement-report-text.ts";
import { consumableExpiryReportLabels } from "./consumable-expiry-report-text.ts";
export type StockPrintValue = string | number | boolean | null | undefined;
export type StockPrintField = [string, StockPrintValue];
export interface StockPrintModel {
  title: string;
  generatedAt: string;
  metadata: StockPrintField[];
  records: { title: string; fields: StockPrintField[] }[];
  empty: string;
  note: string;
}
interface Context {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  unit: "each";
  items: unknown[];
}
function model(
  r: Context,
  title: string,
  language: Language,
  facilityName?: string,
): StockPrintModel {
  const p = stockPrintLabels(language);
  return {
    title,
    generatedAt: r.generatedAt,
    metadata: [
      [p.snapshot, r.generatedAt],
      ...(facilityName
        ? [[p.facilityName, facilityName] as StockPrintField]
        : []),
      [p.tenant, r.tenantId],
      [p.facility, r.facilityId],
      [p.unit, r.unit],
      [p.rows, r.items.length],
    ],
    records: [],
    empty: p.empty,
    note: p.note,
  };
}
export function replenishmentPrintModel(
  r: ReplenishmentReport,
  l: Language,
  facilityName?: string,
): StockPrintModel {
  const t = replenishmentLabels(l),
    p = stockPrintLabels(l),
    m = model(r, t.title, l, facilityName);
  m.empty = t.empty;
  m.records = r.items.map((x) => ({
    title: x.code,
    fields: [
      [p.lotId, x.lotId],
      [t.name, x.name],
      [p.kind, x.kind],
      [t.lot, x.lotNumber],
      [t.supplier, x.supplier],
      [t.reference, x.supplierReference],
      [t.expiry, x.expiresOn],
      [p.ledger, x.stockRecorded],
      [t.available, x.available],
      [t.minimum, x.minimumStock],
      [t.target, x.targetStock],
      [t.suggested, x.suggestedQuantity],
      [t.status, x.status === "suggested" ? t.suggestedStatus : t[x.status]],
    ],
  }));
  return m;
}
export function stockBalancePrintModel(
  r: StockBalanceReport,
  l: Language,
  facilityName?: string,
): StockPrintModel {
  const t = stockBalanceReportLabels(l),
    p = stockPrintLabels(l),
    m = model(r, t.title, l, facilityName);
  m.empty = t.empty;
  m.metadata.push(
    [p.lotFilter, r.filters.lotCode ?? t.allLots],
    [t.status, r.filters.status ? t[r.filters.status] : t.allStatuses],
  );
  m.records = r.items.map((x) => ({
    title: x.code,
    fields: [
      [p.lotId, x.lotId],
      [t.product, x.name],
      [p.kind, x.kind],
      [t.lot, x.lotNumber],
      [t.supplier, x.supplier],
      [t.reference, x.supplierReference],
      [t.expiry, x.expiresOn],
      [p.ledger, x.stockRecorded],
      [p.withdrawn, x.withdrawn],
      [t.received, x.received],
      [t.used, x.used],
      [t.quarantined, x.quarantined],
      [t.discarded, x.discarded],
      [t.adjustments, x.adjustments],
      [t.available, x.available],
      [t.usable, x.usable],
      [t.version, x.stockVersion],
      [t.at, x.lastMovementAt],
      [t.status, t[x.status]],
    ],
  }));
  return m;
}
export function stockMovementPrintModel(
  r: StockMovementReport,
  l: Language,
  facilityName?: string,
): StockPrintModel {
  const t = stockMovementReportLabels(l),
    b = stockBalanceReportLabels(l),
    p = stockPrintLabels(l),
    m = model(r, t.title, l, facilityName);
  m.empty = t.empty;
  m.metadata.push(
    [t.from, r.from],
    [
      t.through,
      new Date(Date.parse(r.to) - 86400000).toISOString().slice(0, 10),
    ],
    [p.lotFilter, r.filters.lotCode ?? t.allLots],
    [t.actionFilter, r.filters.action ? t[r.filters.action] : t.allActions],
  );
  m.records = r.items.map((x) => ({
    title: x.lotCode + " · " + t[x.action],
    fields: [
      [p.movementId, x.id],
      [t.at, x.at],
      [p.lotId, x.lotId],
      [t.product, x.product],
      [t.manufacturerLot, x.manufacturerLot],
      [t.supplier, x.supplier],
      [t.action, t[x.action]],
      [t.quantity, x.quantity],
      [t.delta, x.availableDelta],
      [t.available, x.balance.available],
      [b.received, x.balance.received],
      [b.adjustments, x.balance.adjustments ?? 0],
      [t.used, x.balance.used],
      [t.quarantined, x.balance.quarantined],
      [t.discarded, x.balance.discarded],
      [t.version, x.version],
      [t.package, x.packageCode],
      [p.packageId, x.packageId],
      [p.countId, x.stockCountId],
      [t.reason, x.reason],
      [t.reference, x.reference],
      [t.actor, x.actorId],
      [p.requestId, x.parentRequestId],
    ],
  }));
  return m;
}
export function consumableExpiryPrintModel(
  r: ConsumableExpiryReport,
  l: Language,
  facilityName?: string,
): StockPrintModel {
  const t = consumableExpiryReportLabels(l),
    p = stockPrintLabels(l),
    m = model(r, t.title, l, facilityName);
  m.empty = t.empty;
  m.metadata.push(
    [t.asOf, r.asOfDay],
    [t.through, r.throughDay],
    [t.horizon, r.horizonDays],
    [p.lotFilter, r.filters.lotCode ?? t.allLots],
    [t.status, r.filters.status ? t[r.filters.status] : t.allStatuses],
  );
  m.records = r.items.map((x) => {
    const b = x.balance;
    return {
      title: b.code,
      fields: [
        [p.lotId, b.lotId],
        [t.product, b.name],
        [p.kind, b.kind],
        [t.lot, b.lotNumber],
        [t.supplier, b.supplier],
        [t.reference, b.supplierReference],
        [t.expiry, b.expiresOn],
        [t.days, x.daysToExpiry],
        [t.status, t[x.status]],
        [t.available, b.available],
        [t.quarantined, b.quarantined],
        [t.usable, b.usable],
        [t.withdrawn, b.withdrawn],
        [t.version, b.stockVersion],
        [stockBalanceReportLabels(l).at, b.lastMovementAt],
      ],
    };
  });
  return m;
}
