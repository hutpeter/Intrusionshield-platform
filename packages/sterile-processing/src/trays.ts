import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  instrumentIdFromScan,
  sterileUuid,
  field,
  codeOf,
  pageOf,
  type SterileScope,
  type SterileTransaction,
  type SterileAuditEvent,
} from "./foundation.js";
import type {
  TrayRequirement,
  TrayDefinition,
  TrayDefinitionInput,
  TrayDefinitionRevisionInput,
  TrayAssembly,
  AssemblyAssessment,
  AssemblyView,
  AssemblyInstrument,
} from "./tray-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const expected = (v: number) => {
  if (!Number.isSafeInteger(v) || v < 1) invalid();
  return v;
};
export function assessAssembly(a: TrayAssembly): AssemblyAssessment {
  const rows = a.definitionSnapshot.requirements.map((r) => ({
    instrumentTypeId: r.instrumentTypeId,
    name: r.instrumentTypeName,
    required: r.quantity,
    assigned: a.instruments.filter(
      (i) => i.instrumentTypeId === r.instrumentTypeId,
    ).length,
    missing: 0,
    excess: 0,
  }));
  for (const i of a.instruments)
    if (!rows.some((r) => r.instrumentTypeId === i.instrumentTypeId))
      rows.push({
        instrumentTypeId: i.instrumentTypeId,
        name: i.instrumentTypeName,
        required: 0,
        assigned: a.instruments.filter(
          (x) => x.instrumentTypeId === i.instrumentTypeId,
        ).length,
        missing: 0,
        excess: 0,
      });
  for (const r of rows) {
    r.missing = Math.max(0, r.required - r.assigned);
    r.excess = Math.max(0, r.assigned - r.required);
  }
  const sum = (key: "required" | "assigned" | "missing" | "excess") =>
    rows.reduce((n, r) => n + r[key], 0);
  return {
    complete: sum("missing") === 0 && sum("excess") === 0,
    required: sum("required"),
    assigned: sum("assigned"),
    missing: sum("missing"),
    excess: sum("excess"),
    rows,
  };
}
async function requirements(
  tx: SterileTransaction,
  input: TrayDefinitionInput["requirements"],
): Promise<TrayRequirement[]> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) invalid();
  const result: TrayRequirement[] = [];
  let total = 0;
  for (const r of input) {
    if (
      !r ||
      typeof r !== "object" ||
      Object.keys(r).some((k) => !["instrumentTypeId", "quantity"].includes(k))
    )
      invalid();
    const id = sterileUuid(r.instrumentTypeId);
    if (
      !Number.isSafeInteger(r.quantity) ||
      r.quantity < 1 ||
      r.quantity > 500 ||
      result.some((x) => x.instrumentTypeId === id)
    )
      invalid();
    const type = await tx.findType(id);
    if (!type) throw new SterileError("NOT_FOUND");
    total += r.quantity;
    result.push({
      instrumentTypeId: id,
      instrumentTypeCode: type.code,
      instrumentTypeName: type.name,
      quantity: r.quantity,
    });
  }
  if (total > 1000) invalid();
  return result;
}
async function items(
  tx: SterileTransaction,
  ids: string[],
  assemblyId: string,
): Promise<AssemblyInstrument[]> {
  if (!Array.isArray(ids) || ids.length > 1000) invalid();
  const normalized = ids.map(sterileUuid);
  if (new Set(normalized).size !== normalized.length) invalid();
  const output: AssemblyInstrument[] = [];
  for (const id of normalized) {
    if (await tx.findInstrumentRecallBlock(id))
      throw new SterileError("RECALL_BLOCKED");
    if (await tx.findProcessingHold(id))
      throw new SterileError("PROCESSING_HOLD");
    const i = await tx.findInstrument(id);
    if (!i) throw new SterileError("NOT_FOUND");
    const assigned = await tx.findActiveAssignment(id);
    if (
      i.state !== "registered" ||
      (assigned && assigned.assemblyId !== assemblyId)
    )
      throw new SterileError("INSTRUMENT_ASSIGNED");
    const type = await tx.findType(i.instrumentTypeId);
    if (!type) throw new SterileError("NOT_FOUND");
    output.push({
      id: i.id,
      code: i.code,
      instrumentTypeId: i.instrumentTypeId,
      instrumentTypeName: type.name,
      serialNumber: i.serialNumber,
      instrumentVersion: i.version,
    });
  }
  return output;
}
export class TrayRegistry extends SterileRegistryBase {
  private async event(
    tx: SterileTransaction,
    s: SterileScope,
    requestId: string,
    at: string,
    action: SterileAuditEvent["action"],
    item: TrayDefinition | TrayAssembly,
    reason = "",
  ) {
    await tx.appendAudit({
      id: randomUUID(),
      ...s,
      at,
      action,
      entityId: item.id,
      version: item.version,
      requestId: sterileUuid(requestId),
      reason,
    });
  }
  async createDefinition(
    scope: SterileScope,
    input: TrayDefinitionInput,
  ): Promise<TrayDefinition> {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      name = field(input.name, 200);
    return this.command(
      s,
      input.requestId,
      "tray-definition-create",
      { code, name, requirements: input.requirements },
      async (tx, at) => {
        if (await tx.findDefinitionByCode(code))
          throw new SterileError("CONFLICT");
        const item: TrayDefinition = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          name,
          requirements: await requirements(tx, input.requirements),
          revision: 1,
          version: 1,
          createdAt: at,
          updatedAt: at,
        };
        await tx.insertDefinition(item);
        await tx.insertDefinitionRevision(item);
        await this.event(
          tx,
          s,
          input.requestId,
          at,
          "tray-definition-created",
          item,
        );
        return item;
      },
    );
  }
  async reviseDefinition(
    scope: SterileScope,
    id: string,
    input: TrayDefinitionRevisionInput,
  ): Promise<TrayDefinition> {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      name = field(input.name, 200),
      reason = field(input.reason, 500),
      version = expected(input.version);
    return this.command(
      s,
      input.requestId,
      "tray-definition-revise",
      { id: key, name, reason, version, requirements: input.requirements },
      async (tx, at) => {
        const current = await tx.findDefinition(key);
        if (!current) throw new SterileError("NOT_FOUND");
        if (current.version !== version) throw new SterileError("CONFLICT");
        const item: TrayDefinition = {
          ...current,
          name,
          requirements: await requirements(tx, input.requirements),
          version: version + 1,
          revision: current.revision + 1,
          updatedAt: at,
        };
        await tx.updateDefinition(item, version);
        await tx.insertDefinitionRevision(item);
        await this.event(
          tx,
          s,
          input.requestId,
          at,
          "tray-definition-revised",
          item,
          reason,
        );
        return item;
      },
    );
  }
  async definitions(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listDefinitions(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async definition(scope: SterileScope, id: string, revision?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (revision !== undefined) expected(revision);
    return this.repository.transaction(s, async (tx) => {
      const item =
        revision === undefined
          ? await tx.findDefinition(key)
          : await tx.findDefinitionRevision(key, revision);
      if (!item) throw new SterileError("NOT_FOUND");
      return item;
    });
  }
  async createAssembly(
    scope: SterileScope,
    input: {
      requestId: string;
      code: string;
      definitionId: string;
      definitionVersion: number;
    },
  ): Promise<TrayAssembly> {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      id = sterileUuid(input.definitionId),
      version = expected(input.definitionVersion);
    return this.command(
      s,
      input.requestId,
      "tray-assembly-create",
      { code, id, version },
      async (tx, at) => {
        const d = await tx.findDefinition(id);
        if (!d) throw new SterileError("NOT_FOUND");
        if (d.version !== version || (await tx.findAssemblyByCode(code)))
          throw new SterileError("CONFLICT");
        const a: TrayAssembly = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          definitionId: d.id,
          definitionRevision: d.revision,
          definitionSnapshot: {
            code: d.code,
            name: d.name,
            requirements: structuredClone(d.requirements),
          },
          instruments: [],
          state: "draft",
          version: 1,
          createdAt: at,
          updatedAt: at,
          completedAt: null,
          disassembledAt: null,
          disassemblyReason: null,
        };
        await tx.insertAssembly(a);
        await tx.insertAssemblyVersion(a);
        await this.event(
          tx,
          s,
          input.requestId,
          at,
          "tray-assembly-created",
          a,
        );
        return a;
      },
    );
  }
  async addByScan(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      identifier: string;
      confirmed: boolean;
    },
  ): Promise<TrayAssembly> {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = expected(input.version),
      instrumentId = instrumentIdFromScan(input.identifier);
    if (input.confirmed !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "tray-scan-add",
      { id: key, version, instrumentId },
      async (tx, at) => {
        const old = await tx.findAssembly(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.state !== "draft" || old.version !== version)
          throw new SterileError("CONFLICT");
        if (old.instruments.some((i) => i.id === instrumentId))
          throw new SterileError("SCAN_DUPLICATE");
        if (old.instruments.length >= 1000) invalid();
        const i = await tx.findInstrument(instrumentId);
        if (!i) throw new SterileError("NOT_FOUND");
        if (i.state !== "registered") throw new SterileError("SCAN_INELIGIBLE");
        const required = old.definitionSnapshot.requirements.find(
          (r) => r.instrumentTypeId === i.instrumentTypeId,
        );
        if (
          !required ||
          old.instruments.filter(
            (x) => x.instrumentTypeId === i.instrumentTypeId,
          ).length >= required.quantity
        )
          throw new SterileError("SCAN_TYPE");
        const a: TrayAssembly = {
          ...old,
          instruments: await items(
            tx,
            [...old.instruments.map((x) => x.id), instrumentId],
            key,
          ),
          version: version + 1,
          updatedAt: at,
        };
        await tx.updateAssembly(a, version);
        await tx.replaceAssignments(a);
        await tx.insertAssemblyVersion(a);
        await this.event(
          tx,
          s,
          input.requestId,
          at,
          "tray-instrument-added-by-scan",
          a,
          `${i.code} · RSP-I-${i.id.toUpperCase()}`,
        );
        return a;
      },
    );
  }
  async updateContents(
    scope: SterileScope,
    id: string,
    input: { requestId: string; version: number; instrumentIds: string[] },
  ): Promise<TrayAssembly> {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = expected(input.version);
    return this.command(
      s,
      input.requestId,
      "tray-assembly-contents",
      { id: key, version, instrumentIds: input.instrumentIds },
      async (tx, at) => {
        const current = await tx.findAssembly(key);
        if (!current) throw new SterileError("NOT_FOUND");
        if (current.version !== version || current.state !== "draft")
          throw new SterileError("CONFLICT");
        const a: TrayAssembly = {
          ...current,
          instruments: await items(tx, input.instrumentIds, key),
          version: version + 1,
          updatedAt: at,
        };
        await tx.updateAssembly(a, version);
        await tx.replaceAssignments(a);
        await tx.insertAssemblyVersion(a);
        await this.event(
          tx,
          s,
          input.requestId,
          at,
          "tray-assembly-updated",
          a,
        );
        return a;
      },
    );
  }
  async transition(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      action: "complete" | "disassemble";
      confirmed: true;
      reason: string;
    },
  ): Promise<TrayAssembly> {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = expected(input.version);
    if (
      input.confirmed !== true ||
      !["complete", "disassemble"].includes(input.action)
    )
      invalid();
    const reason = field(input.reason, 500, input.action === "disassemble");
    return this.command(
      s,
      input.requestId,
      "tray-assembly-transition",
      { id: key, version, action: input.action, reason },
      async (tx, at) => {
        const current = await tx.findAssembly(key);
        if (!current) throw new SterileError("NOT_FOUND");
        if (
          current.version !== version ||
          current.state === "disassembled" ||
          (input.action === "complete" && current.state !== "draft")
        )
          throw new SterileError("CONFLICT");
        if (input.action === "disassemble" && (await tx.findActivePackage(key)))
          throw new SterileError("PACKAGING_BLOCKED");
        if (input.action === "complete") {
          const fresh = await items(
            tx,
            current.instruments.map((i) => i.id),
            key,
          );
          if (
            fresh.some(
              (i) =>
                i.instrumentVersion !==
                current.instruments.find((x) => x.id === i.id)!
                  .instrumentVersion,
            )
          )
            throw new SterileError("CONFLICT");
          if (!assessAssembly(current).complete)
            throw new SterileError("ASSEMBLY_INCOMPLETE");
        }
        const a: TrayAssembly = {
          ...current,
          state: input.action === "complete" ? "complete" : "disassembled",
          version: version + 1,
          updatedAt: at,
          ...(input.action === "complete"
            ? { completedAt: at }
            : { disassembledAt: at, disassemblyReason: reason }),
        };
        await tx.updateAssembly(a, version);
        await tx.replaceAssignments(a);
        await tx.insertAssemblyVersion(a);
        await this.event(
          tx,
          s,
          input.requestId,
          at,
          input.action === "complete"
            ? "tray-assembly-completed"
            : "tray-assembly-disassembled",
          a,
          reason,
        );
        return a;
      },
    );
  }
  async assemblies(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listAssemblies(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async assembly(
    scope: SterileScope,
    id: string,
    version?: number,
  ): Promise<AssemblyView> {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) expected(version);
    return this.repository.transaction(s, async (tx) => {
      const a =
        version === undefined
          ? await tx.findAssembly(key)
          : await tx.findAssemblyVersion(key, version);
      if (!a) throw new SterileError("NOT_FOUND");
      return { assembly: a, assessment: assessAssembly(a) };
    });
  }
  async history(
    scope: SterileScope,
    id: string,
    kind: "definition" | "assembly",
    page = 1,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (
        !(kind === "definition"
          ? await tx.findDefinition(key)
          : await tx.findAssembly(key))
      )
        throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
