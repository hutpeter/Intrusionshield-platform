import { reviewStatus } from "./review-types.js";
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
  type SterileAuditEvent,
} from "./foundation.js";
import type {
  SterilizationLoad,
  LoadInput,
  CycleResultInput,
  LoadPackage,
} from "./cycle-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const versionOf = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1) invalid();
  return n;
};
async function members(
  tx: SterileTransaction,
  ids: string[],
  loadId: string,
): Promise<LoadPackage[]> {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100) invalid();
  const keys = ids.map(sterileUuid);
  if (new Set(keys).size !== keys.length) invalid();
  const rows: LoadPackage[] = [];
  for (const id of keys) {
    const p = await tx.findPackage(id);
    if (!p) throw new SterileError("NOT_FOUND");
    const active = await tx.findPackageLoad(id);
    if (p.state !== "packaged" || (active && active.loadId !== loadId))
      throw new SterileError("LOAD_BLOCKED");
    const reservation = await tx.findActivePackage(p.assemblyId);
    if (reservation?.packageId !== p.id) throw new SterileError("LOAD_BLOCKED");
    rows.push({
      id: p.id,
      code: p.code,
      version: p.version,
      assemblyCode: p.assemblySnapshot.code,
      trayName: p.assemblySnapshot.definitionSnapshot.name,
      assemblyId: p.assemblyId,
      assemblyVersion: p.assemblyVersion,
      instrumentCount: p.assemblySnapshot.instruments.length,
    });
  }
  return rows;
}
export class CycleRegistry extends SterileRegistryBase {
  async create(scope: SterileScope, input: LoadInput) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      sterilizer = codeOf(input.sterilizer),
      profile = field(input.profile, 200),
      profileVersion = field(input.profileVersion, 100);
    if (
      input.confirmed !== true ||
      !["steam", "low_temperature", "other"].includes(input.method)
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "load-created",
      input,
      async (tx, at) => {
        if (await tx.findLoadByCode(code)) throw new SterileError("CONFLICT");
        const id = randomUUID(),
          packages = await members(tx, input.packageIds, id);
        const item: SterilizationLoad = {
          id,
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          sterilizer,
          method: input.method,
          profile,
          profileVersion,
          packages,
          state: "draft",
          version: 1,
          createdAt: at,
          updatedAt: at,
          createdBy: s.actorId,
          startedAt: null,
          startedBy: null,
          finishedAt: null,
          finishedBy: null,
          cycleReference: null,
          outcome: null,
          cycleEvidence: null,
          indicatorEvidence: null,
          note: null,
          cancelledAt: null,
          cancelReason: null,
        };
        await tx.insertLoad(item);
        await tx.replaceLoadAssignments(item);
        await this.record(tx, s, item, input.requestId, at, "load-created", "");
        return item;
      },
    );
  }
  async contents(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      packageIds: string[];
      confirmed: boolean;
    },
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version);
    if (input.confirmed !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "load-contents-updated",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findLoad(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.state !== "draft")
          throw new SterileError("CONFLICT");
        const item: SterilizationLoad = {
          ...old,
          version: version + 1,
          updatedAt: at,
          packages: await members(tx, input.packageIds, key),
        };
        await tx.updateLoad(item, version);
        await tx.replaceLoadAssignments(item);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "load-contents-updated",
          "",
        );
        return item;
      },
    );
  }
  async start(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      cycleReference: string;
      confirmed: boolean;
    },
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      cycleReference = codeOf(input.cycleReference);
    if (input.confirmed !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "cycle-started",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findLoad(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.state !== "draft")
          throw new SterileError("CONFLICT");
        const fresh = await members(
          tx,
          old.packages.map((p) => p.id),
          key,
        );
        if (fresh.some((p, n) => p.version !== old.packages[n].version))
          throw new SterileError("CONFLICT");
        for (const p of fresh)
          if ((await tx.findPackageLoad(p.id))?.loadId !== key)
            throw new SterileError("LOAD_BLOCKED");
        if (await tx.findMachineCycle(old.sterilizer, cycleReference))
          throw new SterileError("CONFLICT");
        const item: SterilizationLoad = {
          ...old,
          version: version + 1,
          updatedAt: at,
          state: "running",
          startedAt: at,
          startedBy: s.actorId,
          cycleReference,
        };
        await tx.reserveMachineCycle(item);
        await tx.updateLoad(item, version);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "cycle-started",
          "",
        );
        return item;
      },
    );
  }
  async finish(scope: SterileScope, id: string, input: CycleResultInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version);
    if (
      input.confirmed !== true ||
      !["passed", "failed", "aborted"].includes(input.outcome)
    )
      invalid();
    const cycleEvidence = field(input.cycleEvidence, 500),
      indicatorEvidence = field(
        input.indicatorEvidence,
        500,
        input.outcome === "passed",
      ),
      note = field(input.note, 500, input.outcome !== "passed");
    return this.command(
      s,
      input.requestId,
      "cycle-recorded",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findLoad(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.state !== "running")
          throw new SterileError("CONFLICT");
        const item: SterilizationLoad = {
          ...old,
          version: version + 1,
          updatedAt: at,
          state: input.outcome === "passed" ? "awaiting_review" : input.outcome,
          outcome: input.outcome,
          finishedAt: at,
          finishedBy: s.actorId,
          cycleEvidence,
          indicatorEvidence,
          note,
        };
        await tx.updateLoad(item, version);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "cycle-recorded",
          note,
        );
        return item;
      },
    );
  }
  async cancel(
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
      version = versionOf(input.version),
      reason = field(input.reason, 500);
    if (input.confirmed !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "load-cancelled",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findLoad(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.state !== "draft")
          throw new SterileError("CONFLICT");
        const item: SterilizationLoad = {
          ...old,
          version: version + 1,
          updatedAt: at,
          state: "cancelled",
          cancelledAt: at,
          cancelReason: reason,
        };
        await tx.updateLoad(item, version);
        await tx.replaceLoadAssignments(item);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "load-cancelled",
          reason,
        );
        return item;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    item: SterilizationLoad,
    requestId: string,
    at: string,
    action: SterileAuditEvent["action"],
    reason: string,
  ) {
    await tx.insertLoadVersion(item);
    await tx.appendAudit({
      id: randomUUID(),
      ...s,
      entityId: item.id,
      version: item.version,
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
      const rows = await tx.listLoads(p);
      const items = await Promise.all(
        rows.slice(0, 50).map(async (row) => {
          const r = await tx.findReviewByLoad(row.id);
          return { ...row, ...(r ? { review: reviewStatus(r) } : {}) };
        }),
      );
      return { items, page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) versionOf(version);
    return this.repository.transaction(s, async (tx) => {
      const row =
        version === undefined
          ? await tx.findLoad(key)
          : await tx.findLoadVersion(key, version);
      if (!row) throw new SterileError("NOT_FOUND");
      const review =
        version === undefined ? await tx.findReviewByLoad(key) : null;
      return { ...row, ...(review ? { review: reviewStatus(review) } : {}) };
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findLoad(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
