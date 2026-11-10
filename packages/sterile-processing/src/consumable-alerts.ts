import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  type SterileScope,
} from "./foundation.js";
import type { ConsumableLot } from "./consumables.js";
import type { ConsumableStock } from "./consumable-stock.js";
export interface ConsumableAlertPolicy {
  minimumStock: number | null;
  warningDays: number;
  reason: string;
  reference: string;
  at: string;
  actorId: string;
}
export interface ConsumableAlertInput {
  requestId: string;
  version: number;
  minimumStock: number | null;
  warningDays: number;
  reason: string;
  reference: string;
  confirmed: boolean;
}
export interface ConsumableAlert {
  available: number;
  minimumStock: number | null;
  warningDays: number;
  expiresOn: string;
  lowStock: boolean;
  expiry: "current" | "expiring" | "expired";
  stockRecorded: boolean;
}
export function consumableAlert(
  lot: ConsumableLot,
  stock: ConsumableStock | null,
  now = new Date().toISOString(),
): ConsumableAlert | null {
  if (lot.withdrawal) return null;
  const today = now.slice(0, 10),
    available = stock?.available ?? 0,
    minimumStock = lot.alertPolicy?.minimumStock ?? null,
    warningDays = lot.alertPolicy?.warningDays ?? 7,
    lowStock = minimumStock !== null && available <= minimumStock,
    days = (Date.parse(lot.expiresOn) - Date.parse(today)) / 86400000,
    expiry =
      available > 0 && Number.isFinite(days) && days <= warningDays
        ? days < 0
          ? "expired"
          : "expiring"
        : "current";
  if (!lowStock && expiry === "current") return null;
  return {
    available,
    minimumStock,
    warningDays,
    expiresOn: lot.expiresOn,
    lowStock,
    expiry,
    stockRecorded: !!stock,
  };
}
export class ConsumableAlertRegistry extends SterileRegistryBase {
  async configure(
    scope: SterileScope,
    id: string,
    input: ConsumableAlertInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      (input.minimumStock !== null &&
        (!Number.isSafeInteger(input.minimumStock) ||
          input.minimumStock < 0 ||
          input.minimumStock > 1000000000)) ||
      !Number.isSafeInteger(input.warningDays) ||
      input.warningDays < 1 ||
      input.warningDays > 365
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "consumable-alert-policy-recorded",
      { ...input, id: key },
      async (tx, at) => {
        const lot = await tx.findConsumable(key);
        if (!lot) throw new SterileError("NOT_FOUND");
        if (lot.version !== input.version || lot.withdrawal)
          throw new SterileError("CONFLICT");
        const item: ConsumableLot = {
          ...lot,
          version: lot.version + 1,
          alertPolicy: {
            minimumStock: input.minimumStock,
            warningDays: input.warningDays,
            reason,
            reference,
            at,
            actorId: s.actorId,
          },
        };
        await tx.updateConsumable(item, lot.version);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          entityId: key,
          version: item.version,
          requestId: sterileUuid(input.requestId),
          action: "consumable-alert-policy-recorded",
          at,
          reason,
        });
        return item;
      },
    );
  }
}
