import { recallAdmissionPlan, admitRecall } from "./recall-readmission.js";
import { recallImpact } from "./recall-impact.js";
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
import type {
  RecallRecord,
  RecallInput,
  RecallItem,
  RecallExtensionInput,
  RecallClearanceInput,
  RecallAdmissionInput,
} from "./recall-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const versionOf = (v: number) => {
  if (!Number.isSafeInteger(v) || v < 1) invalid();
  return v;
};
export class RecallRegistry extends SterileRegistryBase {
  async create(
    scope: SterileScope,
    input: RecallInput,
    equipmentIncidentId?: string,
    consumableLotId?: string,
  ) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      sourceId = sterileUuid(input.sourceId),
      sourceVersion = versionOf(input.sourceVersion),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !["load", "package"].includes(input.sourceKind)
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "recall-created",
      {
        ...input,
        ...(consumableLotId
          ? { consumableLotId: sterileUuid(consumableLotId) }
          : {}),
        ...(equipmentIncidentId
          ? { equipmentIncidentId: sterileUuid(equipmentIncidentId) }
          : {}),
      },
      async (tx, at) => {
        if (await tx.findRecallByCode(code)) throw new SterileError("CONFLICT");
        const impact = await recallImpact(tx, s, {
          sourceKind: input.sourceKind,
          sourceId,
          sourceVersion,
        });
        if (input.impactHash !== undefined) {
          if (
            typeof input.impactHash !== "string" ||
            input.impactHash !== impact.impactHash
          )
            throw new SterileError("CONFLICT");
        } else if (impact.items.length !== impact.rootPackageIds.length)
          throw new SterileError("CONFLICT");
        const items = impact.items,
          sourceCode = impact.sourceCode;
        const incident = equipmentIncidentId
          ? await tx.findEquipmentIncident(sterileUuid(equipmentIncidentId))
          : null;
        if (
          equipmentIncidentId &&
          (!incident ||
            input.sourceKind !== "package" ||
            !incident.impact.targets.some((p) => p.id === sourceId))
        )
          throw new SterileError("INVALID_REQUEST");
        const lot = consumableLotId
          ? await tx.findConsumable(sterileUuid(consumableLotId))
          : null;
        if (
          consumableLotId &&
          (!lot?.withdrawal ||
            input.sourceKind !== "package" ||
            !(await tx.findPackage(sourceId))?.consumableLots?.some(
              (x) => x.id === lot.id,
            ))
        )
          throw new SterileError("INVALID_REQUEST");
        const record: RecallRecord = {
          ...(lot?.withdrawal
            ? {
                consumableLot: {
                  id: lot.id,
                  code: lot.code,
                  lotNumber: lot.lotNumber,
                  supplier: lot.supplier,
                  reference: lot.withdrawal.reference,
                  withdrawnAt: lot.withdrawal.at,
                },
              }
            : {}),
          ...(incident
            ? {
                equipmentIncident: {
                  id: incident.id,
                  code: incident.code,
                  equipmentId: incident.equipmentId,
                  equipmentCode: incident.impact.equipment.code,
                  from: incident.impact.from,
                  to: incident.impact.to,
                },
              }
            : {}),
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          sourceKind: input.sourceKind,
          sourceId,
          sourceCode,
          sourceVersion,
          reason,
          reference,
          items,
          lineage: {
            rootPackageIds: impact.rootPackageIds,
            instrumentIds: impact.instruments.map((i) => i.id),
            impactHash: impact.impactHash,
            policy: "recorded-lineage-and-current-custody",
          },
          state: "open",
          version: 1,
          createdAt: at,
          updatedAt: at,
          createdBy: s.actorId,
        };
        await tx.insertRecall(record);
        await tx.insertRecallBlocks(record);
        await tx.insertRecallInstrumentBlocks(record);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          at,
          "recall-created",
          reason,
        );
        return record;
      },
    );
  }
  async impact(
    scope: SterileScope,
    sourceKind: "load" | "package",
    id: string,
    version: number,
  ) {
    const s = scopeOf(scope),
      sourceId = sterileUuid(id),
      sourceVersion = versionOf(version);
    if (!["load", "package"].includes(sourceKind)) invalid();
    return this.repository.transaction(s, (tx) =>
      recallImpact(tx, s, { sourceKind, sourceId, sourceVersion }),
    );
  }
  async caseImpact(scope: SterileScope, id: string) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    return this.repository.transaction(s, async (tx) => {
      const old = await tx.findRecall(key);
      if (!old) throw new SterileError("NOT_FOUND");
      return recallImpact(tx, s, old, old);
    });
  }
  async extend(scope: SterileScope, id: string, input: RecallExtensionInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (input.confirmed !== true || typeof input.impactHash !== "string")
      invalid();
    return this.command(
      s,
      input.requestId,
      "recall-expanded",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findRecall(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.clearance)
          throw new SterileError("CONFLICT");
        const plan = await recallImpact(tx, s, old, old);
        if (plan.impactHash !== input.impactHash)
          throw new SterileError("CONFLICT");
        const added = plan.items.filter(
          (p) => !old.items.some((i) => i.packageId === p.packageId),
        );
        if (!added.length && old.lineage) throw new SterileError("CONFLICT");
        const items = [...old.items, ...added];
        const record: RecallRecord = {
          ...old,
          items,
          version: version + 1,
          updatedAt: at,
          state: added.length ? "open" : old.state,
          lineage: {
            rootPackageIds: plan.rootPackageIds,
            instrumentIds: plan.instruments.map((i) => i.id),
            impactHash: plan.impactHash,
            policy: "recorded-lineage-and-current-custody",
          },
        };
        await tx.updateRecall(record, version);
        await tx.insertRecallBlocks({ ...record, items: added });
        await tx.insertRecallInstrumentBlocks(record);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          at,
          "recall-expanded",
          reason + " · " + reference,
        );
        return record;
      },
    );
  }
  async clear(scope: SterileScope, id: string, input: RecallClearanceInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      resolution = field(input.resolution, 500),
      evidence = field(input.evidence, 500),
      procedure = field(input.procedure, 200),
      procedureVersion = field(input.procedureVersion, 100);
    if (
      [
        input.causeReviewed,
        input.recoveryReviewed,
        input.dispositionReviewed,
        input.reprocessingRequired,
        input.confirmed,
      ].some((v) => v !== true)
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "recall-cleared-for-reprocessing",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findRecall(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.clearance)
          throw new SterileError("CONFLICT");
        if (
          old.state !== "closed" ||
          !old.lineage?.instrumentIds.length ||
          !old.items.length ||
          old.items.some(
            (i) =>
              i.status !== "disposed" ||
              i.disposition?.action !== "reprocess_required",
          )
        )
          throw new SterileError("CLEARANCE_BLOCKED");
        const impact = await recallImpact(tx, s, old, old);
        if (
          impact.items.some(
            (p) => !old.items.some((i) => i.packageId === p.packageId),
          )
        )
          throw new SterileError("CONFLICT");
        const record: RecallRecord = {
          ...old,
          version: version + 1,
          updatedAt: at,
          clearance: {
            version: version + 1,
            instrumentIds: [...old.lineage.instrumentIds],
            resolution,
            evidence,
            procedure,
            procedureVersion,
            causeReviewed: true,
            recoveryReviewed: true,
            dispositionReviewed: true,
            reprocessingRequired: true,
            actorId: s.actorId,
            at,
          },
        };
        await tx.updateRecall(record, version);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          at,
          "recall-cleared-for-reprocessing",
          resolution,
        );
        return record;
      },
    );
  }
  async admissionPlan(scope: SterileScope, id: string) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    return this.repository.transaction(s, async (tx) => {
      const old = await tx.findRecall(key);
      if (!old) throw new SterileError("NOT_FOUND");
      return recallAdmissionPlan(tx, s, old);
    });
  }
  async admit(scope: SterileScope, id: string, input: RecallAdmissionInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      episodeCode = codeOf(input.episodeCode),
      custodian = field(input.custodian, 200),
      location = field(input.location, 200),
      condition = field(input.condition, 500),
      reference = field(input.reference, 200),
      note = field(input.note, 500, false);
    if (
      input.confirmed !== true ||
      input.contentsChecked !== true ||
      typeof input.impactHash !== "string"
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "recall-reprocessing-admitted",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findRecall(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version) throw new SterileError("CONFLICT");
        const record = await admitRecall(
          tx,
          s,
          old,
          {
            ...input,
            episodeCode,
            custodian,
            location,
            condition,
            reference,
            note,
          },
          at,
        );
        await tx.updateRecall(record, version);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          at,
          "recall-reprocessing-admitted",
          reference,
        );
        return record;
      },
    );
  }
  async recover(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      packageId: string;
      location: string;
      reference: string;
      note: string;
      confirmed: boolean;
    },
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      packageId = sterileUuid(input.packageId),
      location = field(input.location, 200),
      reference = field(input.reference, 200),
      note = field(input.note, 500, false);
    if (input.confirmed !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "recall-recovered",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findRecall(key);
        if (!old) throw new SterileError("NOT_FOUND");
        const target = old.items.find((x) => x.packageId === packageId);
        if (!target) throw new SterileError("INVALID_REQUEST");
        if (
          old.version !== version ||
          old.state !== "open" ||
          target.status !== "outstanding"
        )
          throw new SterileError("CONFLICT");
        const record: RecallRecord = {
          ...old,
          version: version + 1,
          updatedAt: at,
          items: old.items.map((x) =>
            x.packageId === packageId
              ? {
                  ...x,
                  status: "recovered",
                  recovery: {
                    location,
                    reference,
                    note,
                    actorId: s.actorId,
                    at,
                  },
                }
              : x,
          ),
        };
        await tx.updateRecall(record, version);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          at,
          "recall-recovered",
          note,
        );
        return record;
      },
    );
  }
  async dispose(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      packageId: string;
      action: "quarantine" | "reprocess_required" | "discard_recorded";
      reason: string;
      reference: string;
      confirmed: boolean;
    },
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      packageId = sterileUuid(input.packageId),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !["quarantine", "reprocess_required", "discard_recorded"].includes(
        input.action,
      )
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "recall-disposition",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findRecall(key);
        if (!old) throw new SterileError("NOT_FOUND");
        const target = old.items.find((x) => x.packageId === packageId);
        if (!target) throw new SterileError("INVALID_REQUEST");
        if (
          old.version !== version ||
          old.state !== "open" ||
          target.status !== "recovered"
        )
          throw new SterileError("CONFLICT");
        const items: RecallItem[] = old.items.map((x) =>
          x.packageId === packageId
            ? {
                ...x,
                status: "disposed",
                disposition: {
                  action: input.action,
                  reason,
                  reference,
                  actorId: s.actorId,
                  at,
                },
              }
            : x,
        );
        const record: RecallRecord = {
          ...old,
          version: version + 1,
          updatedAt: at,
          items,
          state: items.every((x) => x.status === "disposed")
            ? "closed"
            : "open",
        };
        await tx.updateRecall(record, version);
        await this.record(
          tx,
          s,
          record,
          input.requestId,
          at,
          "recall-disposition",
          reason,
        );
        return record;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    r: RecallRecord,
    requestId: string,
    at: string,
    action:
      | "recall-created"
      | "recall-recovered"
      | "recall-disposition"
      | "recall-expanded"
      | "recall-cleared-for-reprocessing"
      | "recall-reprocessing-admitted",
    reason: string,
  ) {
    await tx.insertRecallVersion(r);
    await tx.appendAudit({
      id: randomUUID(),
      ...s,
      entityId: r.id,
      version: r.version,
      requestId: sterileUuid(requestId),
      at,
      action,
      reason,
    });
  }
  async list(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listRecalls(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) versionOf(version);
    return this.repository.transaction(s, async (tx) => {
      const r =
        version === undefined
          ? await tx.findRecall(key)
          : await tx.findRecallVersion(key, version);
      if (!r) throw new SterileError("NOT_FOUND");
      if (version === undefined && r.clearance) {
        const episodes = new Map<
            string,
            { episodeId: string; episodeCode: string; instrumentIds: string[] }
          >(),
          pendingInstrumentIds: string[] = [];
        for (const id of r.clearance.instrumentIds) {
          const link = await tx.findRecallReadmission(r.id, id);
          if (!link) pendingInstrumentIds.push(id);
          else {
            const row = episodes.get(link.episodeId) ?? {
              ...link,
              instrumentIds: [],
            };
            row.instrumentIds.push(id);
            episodes.set(link.episodeId, row);
          }
        }
        return {
          ...r,
          readmission: {
            pendingInstrumentIds,
            episodes: [...episodes.values()],
          },
        };
      }
      return r;
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findRecall(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
