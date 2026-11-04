import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  pageOf,
  type SterileScope,
  type SterileTransaction,
} from "./foundation.js";
import type {
  DistributionRecord,
  StoreInput,
  IssueInput,
} from "./distribution-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const versionOf = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1) invalid();
  return n;
};
async function release(
  tx: SterileTransaction,
  packageId: string,
  packageVersion: number,
  reviewId: string,
  reviewVersion: number,
) {
  const p = await tx.findPackage(packageId);
  if (!p) throw new SterileError("NOT_FOUND");
  const active = await tx.findPackageLoad(packageId);
  if (p.state !== "packaged" || p.version !== packageVersion || !active)
    throw new SterileError("DISTRIBUTION_BLOCKED");
  const r = await tx.findReview(reviewId),
    load = await tx.findLoad(active.loadId),
    decision = r?.decisions.at(-1);
  if (
    !r ||
    r.state !== "released" ||
    r.version !== reviewVersion ||
    r.loadId !== active.loadId ||
    decision?.decision !== "release" ||
    !load ||
    load.version !== r.loadVersion ||
    load.state !== "awaiting_review" ||
    load.outcome !== "passed" ||
    !r.loadSnapshot.packages.some(
      (x) => x.id === packageId && x.version === packageVersion,
    ) ||
    !load.packages.some(
      (x) => x.id === packageId && x.version === packageVersion,
    )
  )
    throw new SterileError("DISTRIBUTION_BLOCKED");
  return { p, r, load, decision };
}
export class DistributionRegistry extends SterileRegistryBase {
  async store(scope: SterileScope, input: StoreInput) {
    const s = scopeOf(scope),
      packageId = sterileUuid(input.packageId),
      packageVersion = versionOf(input.packageVersion),
      reviewId = sterileUuid(input.reviewId),
      reviewVersion = versionOf(input.reviewVersion),
      location = field(input.location, 200),
      reference = field(input.reference, 200);
    if (input.confirmed !== true || input.integrityChecked !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "package-stored",
      input,
      async (tx, at) => {
        if (await tx.findDistributionByPackage(packageId))
          throw new SterileError("CONFLICT");
        const { p, r, load, decision } = await release(
          tx,
          packageId,
          packageVersion,
          reviewId,
          reviewVersion,
        );
        const item: DistributionRecord = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          packageId,
          packageCode: p.code,
          packageVersion,
          loadId: load.id,
          loadCode: load.code,
          loadVersion: load.version,
          reviewId: r.id,
          reviewVersion: r.version,
          releasedAt: decision.at,
          releasedBy: decision.actorId,
          state: "stored",
          location,
          destination: null,
          recipient: null,
          version: 1,
          events: [
            {
              number: 1,
              kind: "stored",
              fromLocation: null,
              toLocation: location,
              destination: null,
              recipient: null,
              reference,
              reason: "",
              integrityChecked: true,
              actorId: s.actorId,
              at,
              requestId: sterileUuid(input.requestId),
            },
          ],
          createdAt: at,
          updatedAt: at,
        };
        await tx.insertDistribution(item);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "package-stored",
          "",
        );
        return item;
      },
    );
  }
  async transfer(
    scope: SterileScope,
    id: string,
    input: {
      requestId: string;
      version: number;
      location: string;
      reference: string;
      reason: string;
      integrityChecked: boolean;
      confirmed: boolean;
    },
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      location = field(input.location, 200),
      reference = field(input.reference, 200),
      reason = field(input.reason, 500);
    if (input.confirmed !== true || input.integrityChecked !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "package-transferred",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findDistribution(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.version !== version ||
          old.state !== "stored" ||
          old.events.length >= 200
        )
          throw new SterileError("CONFLICT");
        if (location === old.location) invalid();
        await release(
          tx,
          old.packageId,
          old.packageVersion,
          old.reviewId,
          old.reviewVersion,
        );
        const item: DistributionRecord = {
          ...old,
          version: version + 1,
          updatedAt: at,
          location,
          events: [
            ...old.events,
            {
              number: version + 1,
              kind: "transferred",
              fromLocation: old.location,
              toLocation: location,
              destination: null,
              recipient: null,
              reference,
              reason,
              integrityChecked: true,
              actorId: s.actorId,
              at,
              requestId: sterileUuid(input.requestId),
            },
          ],
        };
        await tx.updateDistribution(item, version);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "package-transferred",
          reason,
        );
        return item;
      },
    );
  }
  async issue(scope: SterileScope, id: string, input: IssueInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = versionOf(input.version),
      destination = field(input.destination, 200),
      recipient = field(input.recipient, 200),
      reference = field(input.reference, 200);
    if (input.confirmed !== true || input.integrityChecked !== true) invalid();
    return this.command(
      s,
      input.requestId,
      "package-issued",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findDistribution(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.version !== version ||
          old.state !== "stored" ||
          old.events.length >= 200
        )
          throw new SterileError("CONFLICT");
        await release(
          tx,
          old.packageId,
          old.packageVersion,
          old.reviewId,
          old.reviewVersion,
        );
        const item: DistributionRecord = {
          ...old,
          state: "issued",
          version: version + 1,
          updatedAt: at,
          location: null,
          destination,
          recipient,
          events: [
            ...old.events,
            {
              number: version + 1,
              kind: "issued",
              fromLocation: old.location,
              toLocation: null,
              destination,
              recipient,
              reference,
              reason: "",
              integrityChecked: true,
              actorId: s.actorId,
              at,
              requestId: sterileUuid(input.requestId),
            },
          ],
        };
        await tx.updateDistribution(item, version);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "package-issued",
          "",
        );
        return item;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    item: DistributionRecord,
    requestId: string,
    at: string,
    action: "package-stored" | "package-transferred" | "package-issued",
    reason: string,
  ) {
    await tx.insertDistributionVersion(item);
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
      const rows = await tx.listDistribution(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) versionOf(version);
    return this.repository.transaction(s, async (tx) => {
      const item =
        version === undefined
          ? await tx.findDistribution(key)
          : await tx.findDistributionVersion(key, version);
      if (!item) throw new SterileError("NOT_FOUND");
      return item;
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findDistribution(key)))
        throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
