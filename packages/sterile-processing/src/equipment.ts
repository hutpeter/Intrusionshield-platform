import { equipmentStatus } from "./equipment-status.js";
import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  codeOf,
  pageOf,
  type SterileScope,
  type SterileTransaction,
} from "./foundation.js";
export interface ProcessingEquipment {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  name: string;
  kind: "sterilizer" | "washer_disinfector";
  methods: ("steam" | "low_temperature" | "other")[];
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  state: "in_service" | "out_of_service";
  lastServicedAt: string;
  serviceDueAt: string;
  serviceReference: string;
  qualificationDueAt: string;
  qualificationReference: string;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  reason: string;
}
export interface EquipmentInput {
  requestId: string;
  code: string;
  name: string;
  kind: ProcessingEquipment["kind"];
  methods: ProcessingEquipment["methods"];
  manufacturer: string;
  model: string;
  serialNumber: string;
  location: string;
  state: ProcessingEquipment["state"];
  lastServicedAt: string;
  serviceDueAt: string;
  serviceReference: string;
  qualificationDueAt: string;
  qualificationReference: string;
  reason: string;
  confirmed: boolean;
}
export type EquipmentServiceInput = Pick<
  EquipmentInput,
  | "requestId"
  | "state"
  | "lastServicedAt"
  | "serviceDueAt"
  | "serviceReference"
  | "qualificationDueAt"
  | "qualificationReference"
  | "reason"
  | "confirmed"
> & { version: number };
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const positive = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1) invalid();
  return n;
};
function instant(v: string) {
  if (
    typeof v !== "string" ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString() !== v
  )
    invalid();
  return v;
}
function service(input: EquipmentServiceInput | EquipmentInput, at: string) {
  if (
    input.confirmed !== true ||
    !["in_service", "out_of_service"].includes(input.state)
  )
    invalid();
  const result = {
    state: input.state,
    lastServicedAt: instant(input.lastServicedAt),
    serviceDueAt: instant(input.serviceDueAt),
    serviceReference: field(input.serviceReference, 200),
    qualificationDueAt: instant(input.qualificationDueAt),
    qualificationReference: field(input.qualificationReference, 200),
    reason: field(input.reason, 500),
  };
  if (
    result.lastServicedAt > at ||
    result.serviceDueAt <= result.lastServicedAt
  )
    invalid();
  if (
    result.state === "in_service" &&
    (result.serviceDueAt <= at || result.qualificationDueAt <= at)
  )
    throw new SterileError("EQUIPMENT_BLOCKED");
  return result;
}
export async function resolveEquipment(
  tx: SterileTransaction,
  id: string | undefined,
  kind: ProcessingEquipment["kind"],
  method: string,
  reference: string,
  at: string,
): Promise<ProcessingEquipment | undefined> {
  const equipment =
    id === undefined
      ? await tx.findEquipmentByCode(reference.toUpperCase())
      : await tx.findEquipment(sterileUuid(id));
  if (!equipment) {
    if (id !== undefined) throw new SterileError("NOT_FOUND");
    return undefined;
  }
  if (
    equipment.code !== reference.toUpperCase() ||
    equipment.kind !== kind ||
    (kind === "sterilizer" &&
      !equipment.methods.includes(
        method as ProcessingEquipment["methods"][number],
      )) ||
    equipmentStatus(equipment, Date.parse(at)) !== "ready"
  )
    throw new SterileError("EQUIPMENT_BLOCKED");
  return structuredClone(equipment);
}
export class EquipmentRegistry extends SterileRegistryBase {
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    item: ProcessingEquipment,
    requestId: string,
    action:
      "equipment-registered" | "equipment-service-recorded" | "equipment-held",
  ) {
    await tx.insertEquipmentVersion(item);
    await tx.appendAudit({
      id: randomUUID(),
      ...s,
      entityId: item.id,
      version: item.version,
      requestId: sterileUuid(requestId),
      at: item.updatedAt,
      action,
      reason: item.reason,
    });
  }
  async register(scope: SterileScope, input: EquipmentInput) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      name = field(input.name, 200),
      manufacturer = field(input.manufacturer, 200),
      model = field(input.model, 200),
      serialNumber = field(input.serialNumber, 100),
      location = field(input.location, 200);
    if (
      !["sterilizer", "washer_disinfector"].includes(input.kind) ||
      !Array.isArray(input.methods) ||
      input.methods.some(
        (m) => !["steam", "low_temperature", "other"].includes(m),
      ) ||
      new Set(input.methods).size !== input.methods.length ||
      (input.kind === "sterilizer"
        ? input.methods.length < 1
        : input.methods.length !== 0)
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "equipment-register",
      input,
      async (tx, at) => {
        if (await tx.findEquipmentByCode(code))
          throw new SterileError("CONFLICT");
        const item: ProcessingEquipment = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          name,
          kind: input.kind,
          methods: [...input.methods],
          manufacturer,
          model,
          serialNumber,
          location,
          ...service(input, at),
          version: 1,
          createdAt: at,
          createdBy: s.actorId,
          updatedAt: at,
          updatedBy: s.actorId,
        };
        await tx.insertEquipment(item);
        await this.record(tx, s, item, input.requestId, "equipment-registered");
        return item;
      },
    );
  }
  async recordService(
    scope: SterileScope,
    id: string,
    input: EquipmentServiceInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = positive(input.version);
    return this.command(
      s,
      input.requestId,
      "equipment-service",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findEquipment(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version) throw new SterileError("CONFLICT");
        const item: ProcessingEquipment = {
          ...old,
          ...service(input, at),
          version: version + 1,
          updatedAt: at,
          updatedBy: s.actorId,
        };
        await tx.updateEquipment(item, version);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          "equipment-service-recorded",
        );
        return item;
      },
    );
  }
  async hold(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      reason: string;
      confirmed: boolean;
    },
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = positive(input.version),
      reason = field(input.reason, 500);
    if (input.confirmed !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "equipment-hold",
      { id: key, version, reason },
      async (tx, at) => {
        const old = await tx.findEquipment(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.state !== "in_service")
          throw new SterileError("CONFLICT");
        const item: ProcessingEquipment = {
          ...old,
          state: "out_of_service",
          reason,
          version: version + 1,
          updatedAt: at,
          updatedBy: s.actorId,
        };
        await tx.updateEquipment(item, version);
        await this.record(tx, s, item, input.requestId, "equipment-held");
        return item;
      },
    );
  }
  async list(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listEquipment(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) positive(version);
    return this.repository.transaction(s, async (tx) => {
      const item =
        version === undefined
          ? await tx.findEquipment(key)
          : await tx.findEquipmentVersion(key, version);
      if (!item) throw new SterileError("NOT_FOUND");
      return item;
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findEquipment(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
