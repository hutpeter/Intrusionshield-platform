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
import type { RecallRecord, RecallInput, RecallItem } from "./recall-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const versionOf = (v: number) => {
  if (!Number.isSafeInteger(v) || v < 1) invalid();
  return v;
};
export class RecallRegistry extends SterileRegistryBase {
  async create(scope: SterileScope, input: RecallInput) {
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
      input,
      async (tx, at) => {
        if (await tx.findRecallByCode(code)) throw new SterileError("CONFLICT");
        let refs: { id: string; version: number }[], sourceCode: string;
        if (input.sourceKind === "load") {
          const l = await tx.findLoad(sourceId);
          if (!l) throw new SterileError("NOT_FOUND");
          if (l.version !== sourceVersion) throw new SterileError("CONFLICT");
          refs = l.packages.map((p) => ({ id: p.id, version: p.version }));
          sourceCode = l.code;
        } else {
          const p = await tx.findPackage(sourceId);
          if (!p) throw new SterileError("NOT_FOUND");
          if (p.version !== sourceVersion) throw new SterileError("CONFLICT");
          refs = [{ id: p.id, version: p.version }];
          sourceCode = p.code;
        }
        if (
          !refs.length ||
          refs.length > 100 ||
          new Set(refs.map((x) => x.id)).size !== refs.length
        )
          invalid();
        const items: RecallItem[] = [];
        for (const ref of refs) {
          const p = await tx.findPackage(ref.id);
          if (!p) throw new SterileError("NOT_FOUND");
          const d = await tx.findDistributionByPackage(p.id);
          items.push({
            packageId: p.id,
            packageCode: p.code,
            packageVersion: ref.version,
            atRecall: d
              ? {
                  id: d.id,
                  version: d.version,
                  state: d.state,
                  location: d.location,
                  destination: d.destination,
                  recipient: d.recipient,
                }
              : null,
            status: "outstanding",
            recovery: null,
            disposition: null,
          });
        }
        const record: RecallRecord = {
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
          state: "open",
          version: 1,
          createdAt: at,
          updatedAt: at,
          createdBy: s.actorId,
        };
        await tx.insertRecall(record);
        await tx.insertRecallBlocks(record);
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
    action: "recall-created" | "recall-recovered" | "recall-disposition",
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
