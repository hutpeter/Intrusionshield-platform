import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  type SterileScope,
  type SterileTransaction,
} from "./foundation.js";
import type { SterilizationLoad } from "./cycle-types.js";
export interface ServiceUsage {
  id: string;
  tenantId: string;
  facilityId: string;
  instrumentId: string;
  totalRecorded: number;
  serviceBaseline: number;
  interval: number | null;
  warningBefore: number;
  reference: string;
  configuredBy: string | null;
  configuredAt: string | null;
  lastServiceAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ServiceExposure {
  tenantId: string;
  facilityId: string;
  instrumentId: string;
  loadId: string;
  loadCode: string;
  loadVersion: number;
  outcome: string;
  actorId: string;
  at: string;
}
export interface ServicePolicyInput {
  requestId: string;
  version: number;
  interval: number;
  warningBefore: number;
  reference: string;
  confirmed: boolean;
}
export const serviceDue = (r: ServiceUsage | null | undefined) =>
  !!r &&
  r.interval !== null &&
  r.totalRecorded - r.serviceBaseline >= r.interval;
const emptyUsage = (s: SterileScope, id: string, at: string): ServiceUsage => ({
  id: randomUUID(),
  tenantId: s.tenantId,
  facilityId: s.facilityId,
  instrumentId: id,
  totalRecorded: 0,
  serviceBaseline: 0,
  interval: null,
  warningBefore: 0,
  reference: "",
  configuredBy: null,
  configuredAt: null,
  lastServiceAt: null,
  version: 0,
  createdAt: at,
  updatedAt: at,
});
async function save(
  tx: SterileTransaction,
  s: SterileScope,
  old: ServiceUsage,
  next: ServiceUsage,
  requestId: string,
  action:
    | "service-policy-configured"
    | "service-exposure-recorded"
    | "service-baseline-reset",
  at: string,
  reason: string,
) {
  await tx.saveServiceUsage(next, old.version);
  await tx.appendAudit({
    id: randomUUID(),
    ...s,
    entityId: next.id,
    version: next.version,
    requestId: randomUUID(),
    correlationRequestId: requestId,
    action,
    at,
    reason,
  });
}
export async function recordServiceExposures(
  tx: SterileTransaction,
  s: SterileScope,
  load: SterilizationLoad,
  at: string,
  requestId: string,
) {
  const ids = new Set<string>();
  for (const p of load.packages) {
    const record = await tx.findPackage(p.id);
    if (!record) throw new SterileError("CONFLICT");
    for (const i of record.assemblySnapshot.instruments) ids.add(i.id);
  }
  for (const id of ids) {
    const instrument = await tx.findInstrument(id);
    if (!instrument) throw new SterileError("CONFLICT");
    const event: ServiceExposure = {
      tenantId: s.tenantId,
      facilityId: s.facilityId,
      instrumentId: id,
      loadId: load.id,
      loadCode: load.code,
      loadVersion: load.version,
      outcome: load.outcome!,
      actorId: s.actorId,
      at,
    };
    if (!(await tx.insertServiceExposure(event))) continue;
    const old = (await tx.findServiceUsage(id)) ?? emptyUsage(s, id, at);
    if (!Number.isSafeInteger(old.totalRecorded + 1))
      throw new SterileError("CONFLICT");
    await save(
      tx,
      s,
      old,
      {
        ...old,
        totalRecorded: old.totalRecorded + 1,
        version: old.version + 1,
        updatedAt: at,
      },
      requestId,
      "service-exposure-recorded",
      at,
      load.code + " · " + load.outcome,
    );
  }
}
export async function resetServiceBaseline(
  tx: SterileTransaction,
  s: SterileScope,
  id: string,
  at: string,
  requestId: string,
  reason: string,
) {
  const old = await tx.findServiceUsage(id);
  if (!old) return;
  await save(
    tx,
    s,
    old,
    {
      ...old,
      serviceBaseline: old.totalRecorded,
      lastServiceAt: at,
      version: old.version + 1,
      updatedAt: at,
    },
    requestId,
    "service-baseline-reset",
    at,
    reason,
  );
}
export class ServiceUsageRegistry extends SterileRegistryBase {
  async get(scope: SterileScope, id: string) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findInstrument(key))) throw new SterileError("NOT_FOUND");
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        usage: await tx.findServiceUsage(key),
      };
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (!Number.isInteger(page) || page < 1 || page > 99999)
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findInstrument(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listServiceExposures(key, page);
      return { items: rows.slice(0, 50), page, hasMore: rows.length > 50 };
    });
  }
  async audit(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (!Number.isInteger(page) || page < 1 || page > 99999)
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findInstrument(key))) throw new SterileError("NOT_FOUND");
      const usage = await tx.findServiceUsage(key);
      const rows = usage ? await tx.listAudit(usage.id, page) : [];
      return { items: rows.slice(0, 50), page, hasMore: rows.length > 50 };
    });
  }
  async configure(scope: SterileScope, id: string, input: ServicePolicyInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !Number.isInteger(input.version) ||
      input.version < 0 ||
      !Number.isInteger(input.interval) ||
      input.interval < 1 ||
      input.interval > 1000000 ||
      !Number.isInteger(input.warningBefore) ||
      input.warningBefore < 0 ||
      input.warningBefore >= input.interval
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "service-policy-configured",
      { ...input, id: key },
      async (tx, at) => {
        const i = await tx.findInstrument(key);
        if (!i) throw new SterileError("NOT_FOUND");
        if (i.state === "retired") throw new SterileError("CONFLICT");
        const old = (await tx.findServiceUsage(key)) ?? emptyUsage(s, key, at);
        if (old.version !== input.version) throw new SterileError("CONFLICT");
        if (serviceDue(old)) throw new SterileError("SERVICE_DUE");
        const next = {
          ...old,
          interval: input.interval,
          warningBefore: input.warningBefore,
          reference,
          configuredBy: s.actorId,
          configuredAt: at,
          version: old.version + 1,
          updatedAt: at,
        };
        await save(
          tx,
          s,
          old,
          next,
          sterileUuid(input.requestId),
          "service-policy-configured",
          at,
          reference +
            " · interval=" +
            input.interval +
            " · warning=" +
            input.warningBefore,
        );
        return next;
      },
    );
  }
}
