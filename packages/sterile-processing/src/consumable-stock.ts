import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  pageOf,
  type SterileScope,
  type SterileTransaction,
} from "./foundation.js";
import type { ConsumableLot } from "./consumables.js";
export interface ConsumableStock {
  tenantId: string;
  facilityId: string;
  lotId: string;
  unit: "each";
  received: number;
  adjustments?: number;
  used: number;
  quarantined: number;
  discarded: number;
  available: number;
  version: number;
  updatedAt: string;
}
export type StockAction =
  | "receive"
  | "use"
  | "quarantine"
  | "discard"
  | "discard_quarantined"
  | "adjustment";
export type ManualStockAction = Exclude<StockAction, "use" | "adjustment">;
export interface StockMovement {
  stockCountId?: string;
  id: string;
  tenantId: string;
  facilityId: string;
  lotId: string;
  action: StockAction;
  quantity: number;
  unit: "each";
  version: number;
  balance: ConsumableStock;
  packageId: string | null;
  packageCode: string | null;
  reason: string;
  reference: string;
  actorId: string;
  at: string;
  parentRequestId: string;
}
export interface StockInput {
  requestId: string;
  version: number;
  quantity: number;
  reason: string;
  reference: string;
  confirmed: boolean;
}
export interface ConsumableUsageInput {
  lotId: string;
  quantity: number;
}
export interface ConsumableUsage extends ConsumableUsageInput {
  unit: "each";
  lotCode: string;
  movementId: string;
  stockVersionBefore: number;
  stockVersionAfter: number;
}
const max = 1000000000;
function quantity(n: number) {
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw new SterileError("INVALID_REQUEST");
  return n;
}
async function move(
  tx: SterileTransaction,
  s: SterileScope,
  lot: ConsumableLot,
  action: Exclude<StockAction, "adjustment">,
  n: number,
  at: string,
  parentRequestId: string,
  reason: string,
  reference: string,
  pkg?: { id: string; code: string },
  expected?: number,
) {
  const previous = await tx.findConsumableStock(lot.id),
    v = previous?.version ?? 0;
  if (expected !== undefined && expected !== v)
    throw new SterileError("CONFLICT");
  const stock: ConsumableStock = previous
    ? { ...previous }
    : {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        lotId: lot.id,
        unit: "each",
        received: 0,
        used: 0,
        quarantined: 0,
        discarded: 0,
        available: 0,
        version: 0,
        updatedAt: at,
      };
  if (action === "receive") {
    stock.received += n;
    stock.available += n;
  } else if (action === "discard_quarantined") {
    if (stock.quarantined < n) throw new SterileError("INSUFFICIENT_STOCK");
    stock.quarantined -= n;
    stock.discarded += n;
  } else {
    if (stock.available < n) throw new SterileError("INSUFFICIENT_STOCK");
    stock.available -= n;
    if (action === "use") stock.used += n;
    else if (action === "quarantine") stock.quarantined += n;
    else stock.discarded += n;
  }
  if (
    [
      stock.received,
      stock.used,
      stock.quarantined,
      stock.discarded,
      stock.available,
    ].some((x) => !Number.isSafeInteger(x) || x < 0 || x > max)
  )
    throw new SterileError("INVALID_REQUEST");
  stock.version = v + 1;
  stock.updatedAt = at;
  await tx.saveConsumableStock(stock, v);
  const movement: StockMovement = {
    id: randomUUID(),
    ...scopeOf(s),
    lotId: lot.id,
    action,
    quantity: n,
    unit: "each",
    version: stock.version,
    balance: stock,
    packageId: pkg?.id ?? null,
    packageCode: pkg?.code ?? null,
    reason,
    reference,
    actorId: s.actorId,
    at,
    parentRequestId: sterileUuid(parentRequestId),
  };
  await tx.insertConsumableStockMovement(movement);
  await tx.appendAudit({
    id: randomUUID(),
    ...s,
    entityId: lot.id,
    version: stock.version,
    requestId: movement.id,
    action: "consumable-stock-recorded",
    at,
    reason: action + ": " + n + " each · " + reason,
  });
  return movement;
}
export async function consumeStock(
  tx: SterileTransaction,
  s: SterileScope,
  lots: ConsumableLot[] | undefined,
  input: ConsumableUsageInput[] | undefined,
  at: string,
  requestId: string,
  pkg: { id: string; code: string },
): Promise<ConsumableUsage[] | undefined> {
  if (!lots) {
    if (input !== undefined) throw new SterileError("INVALID_REQUEST");
    return undefined;
  }
  if (
    !Array.isArray(input) ||
    input.length !== lots.length ||
    new Set(input.map((x) => x?.lotId)).size !== input.length
  )
    throw new SterileError("INVALID_REQUEST");
  for (const x of input) {
    if (
      !x ||
      typeof x !== "object" ||
      Object.keys(x).length !== 2 ||
      !Object.hasOwn(x, "lotId") ||
      !Object.hasOwn(x, "quantity") ||
      !lots.some((l) => l.id === sterileUuid(x.lotId))
    )
      throw new SterileError("INVALID_REQUEST");
    quantity(x.quantity);
  }
  const result: ConsumableUsage[] = [];
  for (const lot of lots) {
    const n = input.find((x) => x.lotId === lot.id)!.quantity,
      m = await move(
        tx,
        s,
        lot,
        "use",
        n,
        at,
        requestId,
        "Packaging " + pkg.code,
        pkg.code,
        pkg,
      );
    result.push({
      lotId: lot.id,
      lotCode: lot.code,
      quantity: n,
      unit: "each",
      movementId: m.id,
      stockVersionBefore: m.version - 1,
      stockVersionAfter: m.version,
    });
  }
  return result;
}
export class ConsumableStockRegistry extends SterileRegistryBase {
  async record(
    scope: SterileScope,
    id: string,
    action: ManualStockAction,
    input: StockInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      n = quantity(input.quantity),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 0 ||
      !["receive", "quarantine", "discard", "discard_quarantined"].includes(
        action,
      )
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "consumable-stock-recorded",
      { ...input, id: key, action },
      async (tx, at) => {
        const lot = await tx.findConsumable(key);
        if (!lot) throw new SterileError("NOT_FOUND");
        return move(
          tx,
          s,
          lot,
          action,
          n,
          at,
          input.requestId,
          reason,
          reference,
          undefined,
          input.version,
        );
      },
    );
  }
  async report(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const lot = await tx.findConsumable(key);
      if (!lot) throw new SterileError("NOT_FOUND");
      const rows = await tx.listConsumableStockMovements(key, p);
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        lot,
        balance: await tx.findConsumableStock(key),
        movements: {
          items: rows.slice(0, 50),
          page: p,
          hasMore: rows.length > 50,
        },
      };
    });
  }
}
