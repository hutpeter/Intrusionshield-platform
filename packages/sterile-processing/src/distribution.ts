import { assertPackageUsable } from "./package-eligibility.js";
import { reviewStatus } from "./review-types.js";
import { returnStatus } from "./return-types.js";
import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  packageFromScan,
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
  at?: string,
) {
  if (await tx.findReturnByPackage(packageId))
    throw new SterileError("RETURN_BLOCKED");
  if (await tx.findRecallBlock(packageId))
    throw new SterileError("RECALL_BLOCKED");
  const p = await tx.findPackage(packageId);
  if (!p) throw new SterileError("NOT_FOUND");
  await assertPackageUsable(tx, p, at);
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
  async scan(scope: SterileScope, identifier: unknown) {
    const s = scopeOf(scope),
      target = packageFromScan(identifier);
    return this.repository.transaction(s, async (tx) => {
      const active = await tx.findPackageLoad(target.id);
      if (!active) {
        if (!(await tx.findPackage(target.id)))
          throw new SterileError("NOT_FOUND");
        throw new SterileError("DISTRIBUTION_BLOCKED");
      }
      const r = await tx.findReviewByLoad(active.loadId);
      if (!r) throw new SterileError("DISTRIBUTION_BLOCKED");
      const checked = await release(
          tx,
          target.id,
          target.version,
          r.id,
          r.version,
        ),
        distribution = await tx.findDistributionByPackage(target.id);
      if (
        distribution &&
        (distribution.state !== "stored" ||
          distribution.packageVersion !== target.version ||
          distribution.reviewId !== r.id ||
          distribution.reviewVersion !== r.version)
      )
        throw new SterileError("DISTRIBUTION_BLOCKED");
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        package: {
          id: checked.p.id,
          tenantId: checked.p.tenantId,
          facilityId: checked.p.facilityId,
          code: checked.p.code,
          assemblyId: checked.p.assemblyId,
          state: checked.p.state,
          version: checked.p.version,
          createdAt: checked.p.createdAt,
          trayName: checked.p.assemblySnapshot.definitionSnapshot.name,
          instrumentCount: checked.p.assemblySnapshot.instruments.length,
          scanIdentifier: `RSP-P-${checked.p.id.toUpperCase()}-V${checked.p.version}`,
          ...(checked.p.shelfLife ? { shelfLife: checked.p.shelfLife } : {}),
          activeLoad: { ...active, review: reviewStatus(r) },
        },
        distribution,
      };
    });
  }

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
          at,
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
          at,
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
          at,
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
      const items = await Promise.all(
        rows.slice(0, 50).map(async (row) => {
          const p = await tx.findPackage(row.packageId),
            integrityHold = await tx.findPackageIntegrity(row.packageId);
          const recall = await tx.findRecallBlock(row.packageId);
          const returned = await tx.findReturnByPackage(row.packageId);
          return {
            ...row,
            ...(p?.shelfLife ? { shelfLife: p.shelfLife } : {}),
            ...(integrityHold ? { integrityHold } : {}),
            ...(returned ? { returned: returnStatus(returned) } : {}),
            ...(recall ? { recall } : {}),
          };
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
      const item =
        version === undefined
          ? await tx.findDistribution(key)
          : await tx.findDistributionVersion(key, version);
      if (!item) throw new SterileError("NOT_FOUND");
      const p =
        version === undefined ? await tx.findPackage(item.packageId) : null;
      const integrityHold =
        version === undefined
          ? await tx.findPackageIntegrity(item.packageId)
          : null;
      const recall =
        version === undefined ? await tx.findRecallBlock(item.packageId) : null;
      const returned =
        version === undefined
          ? await tx.findReturnByPackage(item.packageId)
          : null;
      return {
        ...item,
        ...(p?.shelfLife ? { shelfLife: p.shelfLife } : {}),
        ...(integrityHold ? { integrityHold } : {}),
        ...(returned ? { returned: returnStatus(returned) } : {}),
        ...(recall ? { recall } : {}),
      };
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
