import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  pageOf,
  type SterileScope,
} from "./foundation.js";
import type {
  LoadReview,
  ReviewInput,
  ReviewDecision,
} from "./review-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const positive = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1) invalid();
  return n;
};
export class ReviewRegistry extends SterileRegistryBase {
  async decide(scope: SterileScope, input: ReviewInput) {
    const s = scopeOf(scope),
      loadId = sterileUuid(input.loadId),
      loadVersion = positive(input.loadVersion),
      reason = field(input.reason, 500),
      reference = field(input.reference, 500);
    if (
      !Number.isSafeInteger(input.reviewVersion) ||
      input.reviewVersion < 0 ||
      input.confirmed !== true ||
      !["release", "hold", "reject"].includes(input.decision) ||
      [
        "cycleChecked",
        "indicatorsChecked",
        "packagesChecked",
        "profileChecked",
      ].some((k) => typeof input[k as keyof ReviewInput] !== "boolean")
    )
      invalid();
    if (
      input.decision === "release" &&
      ![
        input.cycleChecked,
        input.indicatorsChecked,
        input.packagesChecked,
        input.profileChecked,
      ].every((x) => x === true)
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      "load-reviewed",
      input,
      async (tx, at) => {
        const load = await tx.findLoad(loadId);
        if (!load) throw new SterileError("NOT_FOUND");
        if (
          load.version !== loadVersion ||
          !["awaiting_review", "failed", "aborted"].includes(load.state)
        )
          throw new SterileError("CONFLICT");
        const old = await tx.findReviewByLoad(loadId);
        if (old && old.loadVersion !== loadVersion)
          throw new SterileError("CONFLICT");
        if (
          (old?.version ?? 0) !== input.reviewVersion ||
          (old && old.state !== "held") ||
          (old?.decisions.length ?? 0) >= 50
        )
          throw new SterileError("CONFLICT");
        if (!load.packages.length || load.packages.length > 100)
          throw new SterileError("REVIEW_BLOCKED");
        for (const item of load.packages) {
          if (
            input.decision === "release" &&
            (await tx.findRecallBlock(item.id))
          )
            throw new SterileError("RECALL_BLOCKED");
          const p = await tx.findPackage(item.id),
            held = await tx.findPackageLoad(item.id);
          if (
            !p ||
            p.state !== "packaged" ||
            p.version !== item.version ||
            held?.loadId !== loadId
          )
            throw new SterileError("REVIEW_BLOCKED");
        }
        if (
          input.decision === "release" &&
          (load.state !== "awaiting_review" ||
            load.outcome !== "passed" ||
            !load.finishedAt ||
            !load.cycleEvidence?.trim() ||
            !load.indicatorEvidence?.trim() ||
            s.actorId === load.startedBy ||
            s.actorId === load.finishedBy)
        )
          throw new SterileError("REVIEW_BLOCKED");
        const decision: ReviewDecision = {
          number: (old?.version ?? 0) + 1,
          decision: input.decision,
          reason,
          reference,
          cycleChecked: input.cycleChecked,
          indicatorsChecked: input.indicatorsChecked,
          packagesChecked: input.packagesChecked,
          profileChecked: input.profileChecked,
          actorId: s.actorId,
          at,
          requestId: sterileUuid(input.requestId),
        };
        const record: LoadReview = {
          id: old?.id ?? randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          loadId,
          loadVersion,
          loadSnapshot: old?.loadSnapshot ?? load,
          state:
            input.decision === "release"
              ? "released"
              : input.decision === "reject"
                ? "rejected"
                : "held",
          version: decision.number,
          decisions: [...(old?.decisions ?? []), decision],
          createdAt: old?.createdAt ?? at,
          updatedAt: at,
        };
        if (old) await tx.updateReview(record, old.version);
        else await tx.insertReview(record);
        await tx.insertReviewVersion(record);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          entityId: record.id,
          version: record.version,
          action: "load-reviewed",
          requestId: sterileUuid(input.requestId),
          at,
          reason,
        });
        return record;
      },
    );
  }
  async list(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listReviews(p);
      const items = await Promise.all(
        rows.slice(0, 50).map(async (row) => {
          const r = await tx.findReview(row.id);
          const blocks = r
            ? await Promise.all(
                r.loadSnapshot.packages.map((p) => tx.findRecallBlock(p.id)),
              )
            : [];
          return {
            ...row,
            ...(blocks.some(Boolean) ? { recallBlocked: true } : {}),
          };
        }),
      );
      return { items, page: p, hasMore: rows.length > 50 };
    });
  }
  async queue(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listReviewQueue(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) positive(version);
    return this.repository.transaction(s, async (tx) => {
      const record =
        version === undefined
          ? await tx.findReview(key)
          : await tx.findReviewVersion(key, version);
      if (!record) throw new SterileError("NOT_FOUND");
      const blocks =
        version === undefined
          ? await Promise.all(
              record.loadSnapshot.packages.map((p) => tx.findRecallBlock(p.id)),
            )
          : [];
      return {
        ...record,
        ...(blocks.some(Boolean) ? { recallBlocked: true } : {}),
      };
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findReview(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
