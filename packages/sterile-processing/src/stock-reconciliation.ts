import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  pageOf,
  type SterileScope,
} from "./foundation.js";
import type { StockMovement, ConsumableStock } from "./consumable-stock.js";
export interface StockCount {
  id: string;
  tenantId: string;
  facilityId: string;
  lotId: string;
  lotCode: string;
  unit: "each";
  stockVersion: number;
  recordedAvailable: number;
  countedAvailable: number;
  difference: number;
  reason: string;
  reference: string;
  recordedBy: string;
  recordedAt: string;
  state: "pending" | "approved" | "rejected";
  version: number;
  decision: {
    action: "approve" | "reject";
    reason: string;
    reference: string;
    actorId: string;
    at: string;
    stockVersionAfter: number;
    movementId: string | null;
  } | null;
}
export interface StockCountReview {
  lotId: string;
  countId: string;
  recordedAvailable: number;
  countedAvailable: number;
  difference: number;
  reason: string;
  reference: string;
  stockVersion: number;
  currentStockVersion: number | null;
  currentAvailable: number | null;
  stale: boolean;
}
export function stockCountReview(
  count: StockCount,
  stock: ConsumableStock | null,
): StockCountReview {
  return {
    lotId: count.lotId,
    countId: count.id,
    recordedAvailable: count.recordedAvailable,
    countedAvailable: count.countedAvailable,
    difference: count.difference,
    reason: count.reason,
    reference: count.reference,
    stockVersion: count.stockVersion,
    currentStockVersion: stock?.version ?? null,
    currentAvailable: stock?.available ?? null,
    stale:
      !stock ||
      stock.version !== count.stockVersion ||
      stock.available !== count.recordedAvailable,
  };
}
export interface StockCountInput {
  requestId: string;
  stockVersion: number;
  countedAvailable: number;
  reason: string;
  reference: string;
  confirmed: boolean;
}
export interface StockCountDecisionInput {
  requestId: string;
  version: number;
  reason: string;
  reference: string;
  confirmed: boolean;
}
export class StockReconciliationRegistry extends SterileRegistryBase {
  async record(scope: SterileScope, id: string, input: StockCountInput) {
    const s = scopeOf(scope),
      lotId = sterileUuid(id),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.stockVersion) ||
      input.stockVersion < 1 ||
      !Number.isSafeInteger(input.countedAvailable) ||
      input.countedAvailable < 0 ||
      input.countedAvailable > 1000000000
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "stock-count-recorded",
      { ...input, lotId },
      async (tx, at) => {
        const lot = await tx.findConsumable(lotId);
        if (!lot) throw new SterileError("NOT_FOUND");
        const stock = await tx.findConsumableStock(lotId);
        if (
          !stock ||
          stock.version !== input.stockVersion ||
          (await tx.findPendingStockCount(lotId))
        )
          throw new SterileError("CONFLICT");
        const item: StockCount = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          lotId,
          lotCode: lot.code,
          unit: "each",
          stockVersion: stock.version,
          recordedAvailable: stock.available,
          countedAvailable: input.countedAvailable,
          difference: input.countedAvailable - stock.available,
          reason,
          reference,
          recordedBy: s.actorId,
          recordedAt: at,
          state: "pending",
          version: 1,
          decision: null,
        };
        await tx.insertStockCount(item);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          entityId: item.id,
          version: 1,
          requestId: sterileUuid(input.requestId),
          action: "stock-count-recorded",
          at,
          reason,
        });
        return item;
      },
    );
  }
  async decide(
    scope: SterileScope,
    lotId: string,
    id: string,
    action: "approve" | "reject",
    input: StockCountDecisionInput,
  ) {
    const s = scopeOf(scope),
      lid = sterileUuid(lotId),
      key = sterileUuid(id),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !["approve", "reject"].includes(action) ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "stock-count-decided",
      { ...input, lotId: lid, id: key, action },
      async (tx, at) => {
        const count = await tx.findStockCount(key);
        if (!count || count.lotId !== lid) throw new SterileError("NOT_FOUND");
        if (count.state !== "pending" || count.version !== input.version)
          throw new SterileError("CONFLICT");
        const stock = await tx.findConsumableStock(lid);
        if (!stock) throw new SterileError("CONFLICT");
        let movementId: string | null = null,
          afterVersion = stock.version;
        if (action === "approve") {
          if (s.actorId === count.recordedBy)
            throw new SterileError("CONFLICT");
          if (
            stock.version !== count.stockVersion ||
            stock.available !== count.recordedAvailable
          )
            throw new SterileError("CONFLICT");
          if (count.difference !== 0) {
            const adjustment = (stock.adjustments ?? 0) + count.difference;
            if (
              !Number.isSafeInteger(adjustment) ||
              Math.abs(adjustment) > 1000000000
            )
              throw new SterileError("INVALID_REQUEST");
            const next: ConsumableStock = {
              ...stock,
              available: count.countedAvailable,
              adjustments: adjustment,
              version: stock.version + 1,
              updatedAt: at,
            };
            await tx.saveConsumableStock(next, stock.version);
            const movement: StockMovement = {
              id: randomUUID(),
              tenantId: s.tenantId,
              facilityId: s.facilityId,
              lotId: lid,
              action: "adjustment",
              quantity: count.difference,
              unit: "each",
              version: next.version,
              balance: next,
              packageId: null,
              packageCode: null,
              stockCountId: count.id,
              reason,
              reference,
              actorId: s.actorId,
              at,
              parentRequestId: sterileUuid(input.requestId),
            };
            await tx.insertConsumableStockMovement(movement);
            movementId = movement.id;
            afterVersion = next.version;
            await tx.appendAudit({
              id: randomUUID(),
              ...s,
              entityId: lid,
              version: next.version,
              requestId: movement.id,
              action: "consumable-stock-recorded",
              at,
              reason:
                "Stock count adjustment: " +
                count.difference +
                " each · " +
                reason,
            });
          }
        }
        const item: StockCount = {
          ...count,
          state: action === "approve" ? "approved" : "rejected",
          version: count.version + 1,
          decision: {
            action,
            reason,
            reference,
            actorId: s.actorId,
            at,
            stockVersionAfter: afterVersion,
            movementId,
          },
        };
        await tx.updateStockCount(item, count.version);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          entityId: count.id,
          version: item.version,
          requestId: sterileUuid(input.requestId),
          action: "stock-count-decided",
          at,
          reason,
        });
        return item;
      },
    );
  }
  async get(scope: SterileScope, lotId: string, id: string) {
    const s = scopeOf(scope),
      lot = sterileUuid(lotId),
      key = sterileUuid(id);
    return this.repository.transaction(s, async (tx) => {
      const count = await tx.findStockCount(key);
      if (!count || count.lotId !== lot) throw new SterileError("NOT_FOUND");
      return count;
    });
  }
  async list(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      lotId = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findConsumable(lotId)))
        throw new SterileError("NOT_FOUND");
      const rows = await tx.listStockCounts(lotId, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
