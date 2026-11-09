import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  codeOf,
  field,
  pageOf,
  type SterileScope,
  type SterileTransaction,
} from "./foundation.js";
export interface ConsumableUse {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  state: "packaged" | "voided";
  createdAt: string;
}
export type ConsumableKind = "wrap" | "pouch" | "indicator";
export interface ConsumableLot {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  kind: ConsumableKind;
  name: string;
  lotNumber: string;
  supplier: string;
  supplierReference: string;
  expiresOn: string;
  version: number;
  createdAt: string;
  createdBy: string;
}
export interface ConsumableInput {
  requestId: string;
  code: string;
  kind: ConsumableKind;
  name: string;
  lotNumber: string;
  supplier: string;
  supplierReference: string;
  expiresOn: string;
  confirmed: boolean;
}
export function lotExpired(lot: ConsumableLot, at: string) {
  return lot.expiresOn < at.slice(0, 10);
}
export async function resolveConsumables(
  tx: SterileTransaction,
  ids: string[] | undefined,
  at: string,
) {
  if (ids === undefined) return undefined; // Existing API clients remain explicitly unlinked.
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > 10 ||
    new Set(ids).size !== ids.length
  )
    throw new SterileError("INVALID_REQUEST");
  const lots: ConsumableLot[] = [];
  for (const value of ids) {
    const lot = await tx.findConsumable(sterileUuid(value));
    if (!lot) throw new SterileError("NOT_FOUND");
    if (lotExpired(lot, at)) throw new SterileError("CONSUMABLE_EXPIRED");
    lots.push(lot);
  }
  if (lots.filter((x) => x.kind === "wrap" || x.kind === "pouch").length !== 1)
    throw new SterileError("INVALID_REQUEST");
  return lots;
}
export class ConsumableRegistry extends SterileRegistryBase {
  async register(scope: SterileScope, input: ConsumableInput) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      name = field(input.name, 200),
      lotNumber = field(input.lotNumber, 100),
      supplier = field(input.supplier, 200),
      supplierReference = field(input.supplierReference, 200);
    if (
      input.confirmed !== true ||
      !["wrap", "pouch", "indicator"].includes(input.kind) ||
      typeof input.expiresOn !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.expiresOn) ||
      !Number.isFinite(Date.parse(input.expiresOn)) ||
      new Date(input.expiresOn).toISOString().slice(0, 10) !== input.expiresOn
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "consumable-registered",
      input,
      async (tx, at) => {
        if (await tx.findConsumableByCode(code))
          throw new SterileError("CONFLICT");
        const item: ConsumableLot = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          kind: input.kind,
          name,
          lotNumber,
          supplier,
          supplierReference,
          expiresOn: input.expiresOn,
          version: 1,
          createdAt: at,
          createdBy: s.actorId,
        };
        await tx.insertConsumable(item);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          entityId: item.id,
          version: 1,
          requestId: sterileUuid(input.requestId),
          action: "consumable-registered",
          at,
          reason: supplierReference,
        });
        return item;
      },
    );
  }
  async list(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      n = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listConsumables(n);
      return { items: rows.slice(0, 50), page: n, hasMore: rows.length > 50 };
    });
  }
  async packages(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      n = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findConsumable(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listConsumablePackages(key, n);
      return { items: rows.slice(0, 50), page: n, hasMore: rows.length > 50 };
    });
  }
  async detail(scope: SterileScope, id: string) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    return this.repository.transaction(s, async (tx) => {
      const item = await tx.findConsumable(key);
      if (!item) throw new SterileError("NOT_FOUND");
      return item;
    });
  }
}
