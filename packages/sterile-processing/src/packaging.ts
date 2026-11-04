import { distributionStatus } from "./distribution-types.js";
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
import { assessAssembly } from "./trays.js";
import type {
  SterilePackage,
  PackageInput,
  InspectionProof,
} from "./packaging-types.js";
const versionOf = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new SterileError("INVALID_REQUEST");
  return n;
};
export class PackagingRegistry extends SterileRegistryBase {
  async pack(scope: SterileScope, input: PackageInput) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      assemblyId = sterileUuid(input.assemblyId),
      version = versionOf(input.assemblyVersion),
      material = field(input.material, 200),
      materialLot = field(input.materialLot, 100),
      procedure = field(input.procedure, 200),
      procedureVersion = field(input.procedureVersion, 100);
    if (
      input.sealChecked !== true ||
      input.contentsChecked !== true ||
      input.confirmed !== true
    )
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "package-created",
      input,
      async (tx, at) => {
        if (await tx.findPackageByCode(code))
          throw new SterileError("CONFLICT");
        const a = await tx.findAssembly(assemblyId);
        if (!a) throw new SterileError("NOT_FOUND");
        if (a.version !== version) throw new SterileError("CONFLICT");
        if (
          a.state !== "complete" ||
          !assessAssembly(a).complete ||
          !a.completedAt ||
          (await tx.findActivePackage(assemblyId))
        )
          throw new SterileError("PACKAGING_BLOCKED");
        const proofs: InspectionProof[] = [];
        for (const snapshot of a.instruments) {
          const i = await tx.findInstrument(snapshot.id),
            assignment = await tx.findActiveAssignment(snapshot.id);
          if (
            !i ||
            i.state !== "registered" ||
            i.version !== snapshot.instrumentVersion ||
            assignment?.assemblyId !== a.id ||
            (await tx.findProcessingHold(snapshot.id))
          )
            throw new SterileError("PACKAGING_BLOCKED");
          const e = await tx.findLatestProcessing(snapshot.id),
            inspection = e?.inspections?.at(-1),
            check = inspection?.items.find(
              (x) => x.instrumentId === snapshot.id,
            );
          if (
            !e ||
            e.state !== "ready_for_assembly" ||
            !inspection ||
            inspection.outcome !== "passed" ||
            !check ||
            !check.clean ||
            !check.dry ||
            !check.intact ||
            !check.functional ||
            inspection.at > a.completedAt ||
            e.instruments.find((x) => x.id === snapshot.id)
              ?.instrumentVersion !== i.version
          )
            throw new SterileError("PACKAGING_BLOCKED");
          proofs.push({
            instrumentId: i.id,
            episodeId: e.id,
            episodeCode: e.code,
            episodeVersion: e.version,
            inspectionNumber: inspection.number,
            procedure: inspection.procedure,
            procedureVersion: inspection.procedureVersion,
            evidence: inspection.evidence,
            at: inspection.at,
            actorId: inspection.actorId,
            cleaningAttempt: inspection.cleaningAttempt,
            checks: check,
          });
        }
        const item: SterilePackage = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          assemblyId: a.id,
          assemblyVersion: a.version,
          assemblySnapshot: a,
          inspectionProofs: proofs,
          material,
          materialLot,
          procedure,
          procedureVersion,
          sealChecked: true,
          contentsChecked: true,
          state: "packaged",
          version: 1,
          createdAt: at,
          updatedAt: at,
          packedBy: s.actorId,
          voidReason: null,
          voidedAt: null,
        };
        await tx.insertPackage(item);
        await tx.reservePackage(item);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "package-created",
          "",
        );
        return item;
      },
    );
  }
  async void(
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
    if (input.confirmed !== true) throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "package-voided",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findPackage(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version || old.state !== "packaged")
          throw new SterileError("CONFLICT");
        if (await tx.findRecallBlock(key))
          throw new SterileError("RECALL_BLOCKED");
        if (await tx.findPackageLoad(key))
          throw new SterileError("LOAD_BLOCKED");
        const item: SterilePackage = {
          ...old,
          state: "voided",
          version: version + 1,
          updatedAt: at,
          voidedAt: at,
          voidReason: reason,
        };
        await tx.updatePackage(item, version);
        await tx.releasePackage(item);
        await this.record(
          tx,
          s,
          item,
          input.requestId,
          at,
          "package-voided",
          reason,
        );
        return item;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    item: SterilePackage,
    requestId: string,
    at: string,
    action: "package-created" | "package-voided",
    reason: string,
  ) {
    await tx.insertPackageVersion(item);
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
      const rows = await tx.listPackages(p);
      const items = await Promise.all(
        rows.slice(0, 50).map(async (row) => {
          const recall = await tx.findRecallBlock(row.id);
          const distribution = await tx.findDistributionByPackage(row.id);
          const activeLoad = await tx.findPackageLoad(row.id);
          return {
            ...row,
            ...(recall ? { recall } : {}),
            ...(distribution
              ? { distribution: distributionStatus(distribution) }
              : {}),
            ...(activeLoad ? { activeLoad } : {}),
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
          ? await tx.findPackage(key)
          : await tx.findPackageVersion(key, version);
      if (!item) throw new SterileError("NOT_FOUND");
      const activeLoad =
        version === undefined ? await tx.findPackageLoad(key) : null;
      const recall =
        version === undefined ? await tx.findRecallBlock(key) : null;
      const distribution =
        version === undefined ? await tx.findDistributionByPackage(key) : null;
      return {
        ...item,
        ...(recall ? { recall } : {}),
        ...(distribution
          ? { distribution: distributionStatus(distribution) }
          : {}),
        ...(activeLoad ? { activeLoad } : {}),
      };
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findPackage(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
