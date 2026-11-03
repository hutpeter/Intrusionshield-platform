import { createHash, randomUUID } from "node:crypto";

/** Trusted server context; never construct from caller tenant/role headers. */
export interface SterileScope {
  tenantId: string;
  facilityId: string;
  actorId: string;
}
export interface InstrumentType {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  name: string;
  manufacturer: string;
  model: string;
  createdAt: string;
  version: number;
}
export interface Instrument {
  id: string;
  tenantId: string;
  facilityId: string;
  ownerFacilityId: string;
  instrumentTypeId: string;
  code: string;
  serialNumber: string;
  state: "registered" | "retired";
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
  retirementReason: string | null;
  version: number;
}
export interface SterileAuditEvent {
  id: string;
  tenantId: string;
  facilityId: string;
  actorId: string;
  at: string;
  action: "type-created" | "instrument-registered" | "instrument-retired";
  entityId: string;
  version: number;
  requestId: string;
  reason: string;
}
export type SterileRecord = InstrumentType | Instrument;
export interface CommandReceipt {
  hash: string;
  result: SterileRecord;
}
/** All methods are scoped to the transaction's tenant/facility. Writes and audit commit together. */
export interface SterileTransaction {
  findType(id: string): Promise<InstrumentType | null>;
  findTypeByCode(code: string): Promise<InstrumentType | null>;
  listTypes(page: number): Promise<InstrumentType[]>;
  insertType(value: InstrumentType): Promise<void>;
  findInstrument(id: string): Promise<Instrument | null>;
  findInstrumentByCode(code: string): Promise<Instrument | null>;
  listInstruments(page: number): Promise<Instrument[]>;
  insertInstrument(value: Instrument): Promise<void>;
  updateInstrument(value: Instrument, expectedVersion: number): Promise<void>;
  appendAudit(event: SterileAuditEvent): Promise<void>;
  listAudit(entityId: string, page: number): Promise<SterileAuditEvent[]>;
  findReceipt(requestId: string): Promise<CommandReceipt | null>;
  saveReceipt(requestId: string, receipt: CommandReceipt): Promise<void>;
}
export interface SterileRepository {
  transaction<T>(
    scope: SterileScope,
    work: (tx: SterileTransaction) => Promise<T>,
  ): Promise<T>;
}
export class SterileError extends Error {
  constructor(
    public readonly code: "INVALID_REQUEST" | "NOT_FOUND" | "CONFLICT",
  ) {
    super(code);
  }
}
export const sterileCapability = Object.freeze({
  id: "sterile.core",
  name: "Sterile Processing",
  version: "0.1.0",
  category: "clinical-operations",
  status: "ACTIVE" as const,
  description: "Independent instrument and sterile-processing traceability",
  dependencies: ["core.authentication", "core.authorization"],
});
const fail = (code: SterileError["code"]): never => {
  throw new SterileError(code);
};
export function sterileUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    return fail("INVALID_REQUEST");
  return value.toLowerCase();
}
function scopeOf(value: SterileScope): SterileScope {
  return {
    tenantId: sterileUuid(value.tenantId),
    facilityId: sterileUuid(value.facilityId),
    actorId: sterileUuid(value.actorId),
  };
}
function field(value: unknown, max: number, required = true): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return fail("INVALID_REQUEST");
  return value.trim().normalize("NFC");
}
function codeOf(value: unknown): string {
  const code = field(value, 100).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) return fail("INVALID_REQUEST");
  return code;
}
function pageOf(page: number): number {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    return fail("INVALID_REQUEST");
  return page;
}
export class InstrumentRegistry {
  constructor(private readonly repository: SterileRepository) {}
  private async command<T extends SterileRecord>(
    scope: SterileScope,
    requestId: string,
    kind: string,
    body: unknown,
    work: (tx: SterileTransaction, at: string) => Promise<T>,
  ): Promise<T> {
    const s = scopeOf(scope),
      key = sterileUuid(requestId);
    const hash = createHash("sha256")
      .update(JSON.stringify({ scope: s, kind, body }))
      .digest("hex");
    return this.repository.transaction(s, async (tx) => {
      const receipt = await tx.findReceipt(key);
      if (receipt) {
        if (receipt.hash !== hash) return fail("CONFLICT");
        return structuredClone(receipt.result) as T;
      }
      const result = await work(tx, new Date().toISOString());
      await tx.saveReceipt(key, { hash, result: structuredClone(result) });
      return result;
    });
  }
  async createType(
    scope: SterileScope,
    input: {
      requestId: string;
      code: string;
      name: string;
      manufacturer: string;
      model: string;
    },
  ): Promise<InstrumentType> {
    const s = scopeOf(scope),
      value = {
        code: codeOf(input.code),
        name: field(input.name, 200),
        manufacturer: field(input.manufacturer, 200, false),
        model: field(input.model, 200, false),
      };
    return this.command(
      s,
      input.requestId,
      "create-type",
      value,
      async (tx, at) => {
        if (await tx.findTypeByCode(value.code)) return fail("CONFLICT");
        const item: InstrumentType = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          ...value,
          createdAt: at,
          version: 1,
        };
        await tx.insertType(item);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          at,
          action: "type-created",
          entityId: item.id,
          version: 1,
          requestId: sterileUuid(input.requestId),
          reason: "",
        });
        return item;
      },
    );
  }
  async register(
    scope: SterileScope,
    input: {
      requestId: string;
      instrumentTypeId: string;
      code: string;
      serialNumber: string;
    },
  ): Promise<Instrument> {
    const s = scopeOf(scope),
      value = {
        instrumentTypeId: sterileUuid(input.instrumentTypeId),
        code: codeOf(input.code),
        serialNumber: field(input.serialNumber, 200, false),
      };
    return this.command(
      s,
      input.requestId,
      "register",
      value,
      async (tx, at) => {
        if (!(await tx.findType(value.instrumentTypeId)))
          return fail("NOT_FOUND");
        if (await tx.findInstrumentByCode(value.code)) return fail("CONFLICT");
        const item: Instrument = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          ownerFacilityId: s.facilityId,
          ...value,
          state: "registered",
          createdAt: at,
          updatedAt: at,
          retiredAt: null,
          retirementReason: null,
          version: 1,
        };
        await tx.insertInstrument(item);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          at,
          action: "instrument-registered",
          entityId: item.id,
          version: 1,
          requestId: sterileUuid(input.requestId),
          reason: "",
        });
        return item;
      },
    );
  }
  async retire(
    scope: SterileScope,
    id: string,
    input: { requestId: string; version: number; reason: string },
  ): Promise<Instrument> {
    const s = scopeOf(scope),
      entityId = sterileUuid(id),
      reason = field(input.reason, 500);
    if (!Number.isSafeInteger(input.version) || input.version < 1)
      return fail("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "retire",
      { id: entityId, version: input.version, reason },
      async (tx, at) => {
        const current = await tx.findInstrument(entityId);
        if (!current) return fail("NOT_FOUND");
        if (current.version !== input.version || current.state !== "registered")
          return fail("CONFLICT");
        const item: Instrument = {
          ...current,
          state: "retired",
          retiredAt: at,
          retirementReason: reason,
          updatedAt: at,
          version: current.version + 1,
        };
        await tx.updateInstrument(item, current.version);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          at,
          action: "instrument-retired",
          entityId: item.id,
          version: item.version,
          requestId: sterileUuid(input.requestId),
          reason,
        });
        return item;
      },
    );
  }
  async listTypes(
    scope: SterileScope,
    page = 1,
  ): Promise<{ items: InstrumentType[]; page: number; hasMore: boolean }> {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listTypes(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async list(
    scope: SterileScope,
    page = 1,
  ): Promise<{ items: Instrument[]; page: number; hasMore: boolean }> {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listInstruments(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async history(
    scope: SterileScope,
    id: string,
    page = 1,
  ): Promise<{ items: SterileAuditEvent[]; page: number; hasMore: boolean }> {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findInstrument(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string): Promise<Instrument> {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    return this.repository.transaction(s, async (tx) => {
      const item = await tx.findInstrument(key);
      if (!item) return fail("NOT_FOUND");
      return item;
    });
  }
}
export { sterileCatalogues, sterileMessages } from "./messages.js";
