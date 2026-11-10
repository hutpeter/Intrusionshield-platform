import { recallImpact } from "./recall-impact.js";
import { RecallRegistry } from "./recalls.js";
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
  type SterileRepository,
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
export interface ConsumableDecisionInput {
  requestId: string;
  version: number;
  reason: string;
  reference: string;
  confirmed: boolean;
}
export interface ConsumableRecallInput extends ConsumableDecisionInput {
  packageId: string;
  impactHash: string;
  code: string;
}
export interface ConsumableLot {
  alertPolicy?: import("./consumable-alerts.js").ConsumableAlertPolicy;
  stock?: import("./consumable-stock.js").ConsumableStock;
  withdrawal?: {
    at: string;
    actorId: string;
    reason: string;
    reference: string;
  };
  recalls?: { id: string; code: string; packageId: string; at: string }[];
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
    if (lot.withdrawal) throw new SterileError("CONSUMABLE_WITHDRAWN");
    if (lotExpired(lot, at)) throw new SterileError("CONSUMABLE_EXPIRED");
    lots.push(lot);
  }
  if (lots.filter((x) => x.kind === "wrap" || x.kind === "pouch").length !== 1)
    throw new SterileError("INVALID_REQUEST");
  return lots;
}
export class ConsumableRegistry extends SterileRegistryBase {
  async withdraw(
    scope: SterileScope,
    id: string,
    input: ConsumableDecisionInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "consumable-withdrawn",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findConsumable(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== input.version || old.withdrawal)
          throw new SterileError("CONFLICT");
        const item: ConsumableLot = {
          ...old,
          version: old.version + 1,
          withdrawal: { at, actorId: s.actorId, reason, reference },
        };
        await tx.updateConsumable(item, old.version);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          entityId: key,
          version: item.version,
          requestId: sterileUuid(input.requestId),
          action: "consumable-withdrawn",
          at,
          reason,
        });
        return item;
      },
    );
  }
  async recallPreview(scope: SterileScope, id: string, packageId: string) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      pid = sterileUuid(packageId);
    return this.repository.transaction(s, async (tx) => {
      const lot = await tx.findConsumable(key),
        p = await tx.findPackage(pid);
      if (!lot || !p) throw new SterileError("NOT_FOUND");
      if (
        !lot.withdrawal ||
        !p.consumableLots?.some((x) => x.id === key) ||
        lot.recalls?.some((x) => x.packageId === pid)
      )
        throw new SterileError("CONFLICT");
      return recallImpact(tx, s, {
        sourceKind: "package",
        sourceId: pid,
        sourceVersion: p.version,
      });
    });
  }
  async createRecall(
    scope: SterileScope,
    id: string,
    input: ConsumableRecallInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      pid = sterileUuid(input.packageId),
      code = codeOf(input.code),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      typeof input.impactHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(input.impactHash)
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "consumable-recall-created",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findConsumable(key),
          p = await tx.findPackage(pid);
        if (!old || !p) throw new SterileError("NOT_FOUND");
        if (
          !old.withdrawal ||
          old.version !== input.version ||
          !p.consumableLots?.some((x) => x.id === key) ||
          old.recalls?.some((x) => x.packageId === pid)
        )
          throw new SterileError("CONFLICT");
        const direct: SterileRepository = {
          transaction: async (other, work) => {
            if (
              other.tenantId !== s.tenantId ||
              other.facilityId !== s.facilityId ||
              other.actorId !== s.actorId
            )
              throw new SterileError("INVALID_REQUEST");
            return work(tx);
          },
        };
        const recall = await new RecallRegistry(direct).create(
          s,
          {
            requestId: randomUUID(),
            code,
            sourceKind: "package",
            sourceId: pid,
            sourceVersion: p.version,
            reason,
            reference,
            impactHash: input.impactHash,
            confirmed: true,
          },
          undefined,
          key,
        );
        const item: ConsumableLot = {
          ...old,
          version: old.version + 1,
          recalls: [
            ...(old.recalls ?? []),
            { id: recall.id, code: recall.code, packageId: pid, at },
          ],
        };
        await tx.updateConsumable(item, old.version);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          entityId: key,
          version: item.version,
          requestId: sterileUuid(input.requestId),
          action: "consumable-recall-created",
          at,
          reason,
        });
        return item;
      },
    );
  }
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
      return {
        items: await Promise.all(
          rows.slice(0, 50).map(async (lot) => {
            const stock = await tx.findConsumableStock(lot.id);
            return { ...lot, ...(stock ? { stock } : {}) };
          }),
        ),
        page: n,
        hasMore: rows.length > 50,
      };
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
