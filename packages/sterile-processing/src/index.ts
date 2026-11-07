import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  scopeOf,
  instrumentIdFromScan,
  field,
  codeOf,
  pageOf,
  sterileUuid,
  SterileError,
  type SterileScope,
  type Instrument,
  type InstrumentType,
  type SterileAuditEvent,
} from "./foundation.js";
export * from "./foundation.js";
export * from "./tray-types.js";
export { TrayRegistry, assessAssembly } from "./trays.js";
export class InstrumentRegistry extends SterileRegistryBase {
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
        if (await tx.findTypeByCode(value.code))
          throw new SterileError("CONFLICT");
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
          throw new SterileError("NOT_FOUND");
        if (await tx.findInstrumentByCode(value.code))
          throw new SterileError("CONFLICT");
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
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "retire",
      { id: entityId, version: input.version, reason },
      async (tx, at) => {
        const current = await tx.findInstrument(entityId);
        if (!current) throw new SterileError("NOT_FOUND");
        if (current.version !== input.version || current.state !== "registered")
          throw new SterileError("CONFLICT");
        if (await tx.findProcessingHold(entityId))
          throw new SterileError("PROCESSING_HOLD");
        if (await tx.findActiveAssignment(entityId))
          throw new SterileError("INSTRUMENT_ASSIGNED");
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
  async lookupScan(scope: SterileScope, value: unknown): Promise<Instrument> {
    return this.get(scope, instrumentIdFromScan(value));
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
      const items = await Promise.all(
        rows.slice(0, 50).map(async (item) => {
          const recall = await tx.findInstrumentRecallBlock(item.id);
          const processingHold = await tx.findProcessingHold(item.id);
          const activeAssembly = await tx.findActiveAssignment(item.id);
          const serviceUsage = await tx.findServiceUsage(item.id);
          return {
            ...item,
            scanIdentifier: "RSP-I-" + item.id.toUpperCase(),
            ...(serviceUsage ? { serviceUsage } : {}),
            ...(item.externalOwnership
              ? {
                  loanerStatus: (
                    await tx.findLoaner(item.externalOwnership.loanerId)
                  )?.state,
                }
              : {}),
            ...(recall ? { recall } : {}),
            ...(processingHold ? { processingHold } : {}),
            ...(activeAssembly ? { activeAssembly } : {}),
          };
        }),
      );
      return { items, page: p, hasMore: rows.length > 50 };
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
      if (!item) throw new SterileError("NOT_FOUND");
      const recall = await tx.findInstrumentRecallBlock(key);
      const processingHold = await tx.findProcessingHold(key);
      const activeAssembly = await tx.findActiveAssignment(key);
      const serviceUsage = await tx.findServiceUsage(key);
      return {
        ...item,
        scanIdentifier: "RSP-I-" + item.id.toUpperCase(),
        ...(serviceUsage ? { serviceUsage } : {}),
        ...(item.externalOwnership
          ? {
              loanerStatus: (
                await tx.findLoaner(item.externalOwnership.loanerId)
              )?.state,
            }
          : {}),
        ...(recall ? { recall } : {}),
        ...(processingHold ? { processingHold } : {}),
        ...(activeAssembly ? { activeAssembly } : {}),
      };
    });
  }
}
export { sterileCatalogues, sterileMessages } from "./messages.js";

export * from "./processing-types.js";
export { ProcessingRegistry } from "./processing.js";

export * from "./packaging-types.js";
export { PackagingRegistry } from "./packaging.js";

export * from "./cycle-types.js";
export { CycleRegistry } from "./cycles.js";

export * from "./review-types.js";
export { ReviewRegistry } from "./reviews.js";

export * from "./distribution-types.js";
export { DistributionRegistry } from "./distribution.js";

export * from "./recall-types.js";
export { RecallRegistry } from "./recalls.js";

export * from "./return-types.js";
export * from "./returns.js";

export * from "./trace-types.js";
export * from "./traceability.js";

export * from "./maintenance.js";

export * from "./dashboard.js";

export * from "./service-usage.js";

export * from "./loaners.js";
