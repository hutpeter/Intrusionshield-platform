import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  packageFromScan,
  sterileUuid,
  codeOf,
  field,
  pageOf,
  type SterileScope,
  type SterileTransaction,
  type SterileAuditEvent,
} from "./foundation.js";
import type {
  PartialReturnInput,
  ReturnRecoveryInput,
  ReturnRecord,
  ReturnInput,
  ScannedReturnInput,
  ReturnScanResult,
  ReturnDispositionInput,
} from "./return-types.js";
import type { ProcessingEpisode } from "./processing-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const ver = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1) invalid();
  return n;
};
export class ReturnRegistry extends SterileRegistryBase {
  async scan(
    scope: SterileScope,
    identifier: unknown,
  ): Promise<ReturnScanResult> {
    const s = scopeOf(scope),
      target = packageFromScan(identifier);
    return this.repository.transaction(s, async (tx) => {
      const p = await tx.findPackage(target.id);
      if (!p) throw new SterileError("NOT_FOUND");
      if (p.state !== "packaged" || p.version !== target.version)
        throw new SterileError("CONFLICT");
      if (await tx.findReturnByPackage(p.id))
        throw new SterileError("RETURN_BLOCKED");
      const issue = await tx.findDistributionByPackage(p.id);
      if (
        !issue ||
        issue.state !== "issued" ||
        issue.packageVersion !== p.version
      )
        throw new SterileError("RETURN_BLOCKED");
      return {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        identifier: `RSP-P-${p.id.toUpperCase()}-V${p.version}`,
        issue,
        manifest: p.assemblySnapshot.instruments,
        recall: await tx.findRecallBlock(p.id),
      };
    });
  }
  async createScanned(scope: SterileScope, input: ScannedReturnInput) {
    const { identifier, receivedInstrumentIds, ...receipt } = input,
      target = packageFromScan(identifier);
    if (
      !Array.isArray(receivedInstrumentIds) ||
      receivedInstrumentIds.length > 1000
    )
      invalid();
    const ids = receivedInstrumentIds.map(sterileUuid);
    if (new Set(ids).size !== ids.length)
      throw new SterileError("RETURN_CONTENTS_MISMATCH");
    return this.createInternal(scope, receipt, { ...target, receivedIds: ids });
  }

  async createPartial(scope: SterileScope, input: PartialReturnInput) {
    const {
      identifier,
      receivedInstrumentIds,
      reason,
      observedConfirmed,
      ...receipt
    } = input;
    if (
      observedConfirmed !== true ||
      !Array.isArray(receivedInstrumentIds) ||
      receivedInstrumentIds.length > 1000
    )
      invalid();
    const ids = receivedInstrumentIds.map(sterileUuid);
    if (new Set(ids).size !== ids.length)
      throw new SterileError("RETURN_CONTENTS_MISMATCH");
    return this.createInternal(
      scope,
      { ...receipt, contentsChecked: true },
      {
        ...packageFromScan(identifier),
        receivedIds: ids,
        reason: field(reason, 500),
      },
    );
  }
  async recoverMissing(
    scope: SterileScope,
    id: string,
    input: ReturnRecoveryInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = ver(input.version),
      location = field(input.location, 200),
      custodian = field(input.custodian, 200),
      reference = field(input.reference, 200),
      note = field(input.note, 500, false);
    if (
      input.confirmed !== true ||
      !Array.isArray(input.receivedInstrumentIds) ||
      !input.receivedInstrumentIds.length ||
      input.receivedInstrumentIds.length > 1000
    )
      invalid();
    const ids = input.receivedInstrumentIds.map(sterileUuid);
    if (new Set(ids).size !== ids.length)
      throw new SterileError("RETURN_CONTENTS_MISMATCH");
    return this.command(
      s,
      input.requestId,
      "return-missing-received",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findReturn(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.version !== version ||
          old.state !== "discrepancy" ||
          !old.reconciliation ||
          old.disposition
        )
          throw new SterileError("CONFLICT");
        const previous = old.reconciliation;
        if (ids.some((id) => !previous.missingInstrumentIds.includes(id)))
          throw new SterileError("RETURN_CONTENTS_MISMATCH");
        const p = await tx.findPackage(old.packageId);
        if (!p || p.version !== old.packageVersion || p.state !== "packaged")
          throw new SterileError("CONFLICT");
        await this.partialCustody(tx, p);
        const missing = previous.missingInstrumentIds.filter(
          (id) => !ids.includes(id),
        );
        const r: ReturnRecord = {
          ...old,
          version: version + 1,
          updatedAt: at,
          state: missing.length ? "discrepancy" : "returned",
          reconciliation: {
            ...previous,
            receivedInstrumentIds: [...previous.receivedInstrumentIds, ...ids],
            missingInstrumentIds: missing,
            recoveries: [
              ...previous.recoveries,
              {
                instrumentIds: ids,
                location,
                custodian,
                reference,
                note,
                actorId: s.actorId,
                at,
              },
            ],
          },
        };
        await tx.updateReturn(r, version);
        await this.record(
          tx,
          s,
          r,
          input.requestId,
          at,
          "return-missing-received",
          reference,
        );
        return r;
      },
    );
  }
  private async partialCustody(
    tx: SterileTransaction,
    p: import("./packaging-types.js").SterilePackage,
  ) {
    const active = await tx.findActivePackage(p.assemblyId);
    if (active?.packageId !== p.id) throw new SterileError("RETURN_BLOCKED");
    for (const i of p.assemblySnapshot.instruments) {
      const assignment = await tx.findActiveAssignment(i.id);
      if (
        assignment?.assemblyId !== p.assemblyId ||
        (await tx.findProcessingHold(i.id))
      )
        throw new SterileError("RETURN_BLOCKED");
    }
  }
  async create(scope: SterileScope, input: ReturnInput) {
    return this.createInternal(scope, input);
  }
  private async createInternal(
    scope: SterileScope,
    input: ReturnInput,
    scan?: {
      id: string;
      version: number;
      receivedIds: string[];
      reason?: string;
    },
  ) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      id = sterileUuid(input.distributionId),
      version = ver(input.distributionVersion),
      location = field(input.location, 200),
      custodian = field(input.custodian, 200),
      reference = field(input.reference, 200),
      note = field(input.note, 500, false);
    if (
      input.confirmed !== true ||
      input.contentsChecked !== true ||
      !["unopened", "opened", "used", "damaged"].includes(input.condition)
    )
      invalid();
    return this.command(
      s,
      input.requestId,
      scan?.reason ? "return-discrepancy-recorded" : "package-returned",
      scan ? { ...input, scan } : input,
      async (tx, at) => {
        const d = await tx.findDistribution(id);
        if (!d) throw new SterileError("NOT_FOUND");
        if (
          d.version !== version ||
          d.state !== "issued" ||
          (await tx.findReturnByPackage(d.packageId)) ||
          (await tx.findReturnByCode(code))
        )
          throw new SterileError("CONFLICT");
        const p = await tx.findPackage(d.packageId);
        if (!p || p.version !== d.packageVersion || p.state !== "packaged")
          throw new SterileError("CONFLICT");
        if (scan) {
          if (scan.id !== p.id || scan.version !== p.version)
            throw new SterileError("CONFLICT");
          const expectedIds = p.assemblySnapshot.instruments.map((i) => i.id);
          if (scan.reason) {
            if (
              !expectedIds.length ||
              expectedIds.length > 1000 ||
              scan.receivedIds.length >= expectedIds.length ||
              scan.receivedIds.some((id) => !expectedIds.includes(id))
            )
              throw new SterileError("RETURN_CONTENTS_MISMATCH");
            await this.partialCustody(tx, p);
          } else if (
            scan.receivedIds.length !== expectedIds.length ||
            expectedIds.some((id) => !scan.receivedIds.includes(id))
          )
            throw new SterileError("RETURN_CONTENTS_MISMATCH");
        }
        const r: ReturnRecord = {
          ...(scan
            ? {
                scanReceipt: {
                  identifier: `RSP-P-${p.id.toUpperCase()}-V${p.version}`,
                  contents: p.assemblySnapshot.instruments,
                },
              }
            : {}),
          ...(scan?.reason
            ? {
                reconciliation: {
                  manifest: p.assemblySnapshot.instruments,
                  receivedInstrumentIds: scan.receivedIds,
                  missingInstrumentIds: p.assemblySnapshot.instruments
                    .filter((i) => !scan.receivedIds.includes(i.id))
                    .map((i) => i.id),
                  reason: scan.reason,
                  recoveries: [],
                },
              }
            : {}),
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          packageId: p.id,
          packageCode: p.code,
          packageVersion: p.version,
          issue: d,
          condition: input.condition,
          location,
          custodian,
          reference,
          note,
          state: scan?.reason ? "discrepancy" : "returned",
          disposition: null,
          episodeId: null,
          episodeCode: null,
          version: 1,
          createdAt: at,
          updatedAt: at,
          receivedBy: s.actorId,
        };
        await tx.insertReturn(r);
        await this.record(
          tx,
          s,
          r,
          input.requestId,
          at,
          scan?.reason ? "return-discrepancy-recorded" : "package-returned",
          scan?.reason ?? note,
        );
        return r;
      },
    );
  }
  async dispose(
    scope: SterileScope,
    id: string,
    input: ReturnDispositionInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = ver(input.version),
      reason = field(input.reason, 500),
      reference = field(input.reference, 200);
    if (
      input.confirmed !== true ||
      !["quarantine", "reprocess"].includes(input.action)
    )
      invalid();
    const episodeCode =
      input.action === "reprocess"
        ? codeOf(input.episodeCode)
        : field(input.episodeCode, 100, false);
    return this.command(
      s,
      input.requestId,
      "return-disposition",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findReturn(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== version) throw new SterileError("CONFLICT");
        if (old.reconciliation?.missingInstrumentIds.length)
          throw new SterileError("RETURN_BLOCKED");
        if (old.state !== "returned") throw new SterileError("CONFLICT");
        let episode: ProcessingEpisode | null = null;
        if (input.action === "reprocess") {
          // Recall handling and damaged-instrument repair require their own authorization policy.
          if (await tx.findRecallBlock(old.packageId))
            throw new SterileError("RECALL_BLOCKED");
          if (old.condition === "damaged")
            throw new SterileError("RETURN_BLOCKED");
          const p = await tx.findPackage(old.packageId);
          if (!p || p.state !== "packaged" || p.version !== old.packageVersion)
            throw new SterileError("CONFLICT");
          const a = await tx.findAssembly(p.assemblyId),
            active = await tx.findActivePackage(p.assemblyId);
          if (
            !a ||
            a.state !== "complete" ||
            a.version !== p.assemblyVersion ||
            active?.packageId !== p.id ||
            !a.instruments.length
          )
            throw new SterileError("CONFLICT");
          if (await tx.findProcessingByCode(episodeCode))
            throw new SterileError("CONFLICT");
          const instruments: ProcessingEpisode["instruments"] = [];
          for (const member of a.instruments) {
            if (await tx.findInstrumentRecallBlock(member.id))
              throw new SterileError("RECALL_BLOCKED");
            const i = await tx.findInstrument(member.id),
              assignment = await tx.findActiveAssignment(member.id);
            if (
              !i ||
              i.state !== "registered" ||
              assignment?.assemblyId !== a.id ||
              (await tx.findProcessingHold(member.id))
            )
              throw new SterileError("CONFLICT");
            const t = await tx.findType(i.instrumentTypeId);
            if (!t) throw new SterileError("NOT_FOUND");
            instruments.push({
              id: i.id,
              code: i.code,
              serialNumber: i.serialNumber,
              instrumentTypeId: t.id,
              instrumentTypeName: t.name,
              instrumentVersion: i.version,
            });
          }
          episode = {
            id: randomUUID(),
            tenantId: s.tenantId,
            facilityId: s.facilityId,
            code: episodeCode,
            source: "RETURN " + old.code,
            custodian: old.custodian,
            condition: old.condition,
            discrepancies: old.note,
            instruments,
            state: "received",
            attempts: [],
            inspections: [],
            version: 1,
            createdAt: at,
            updatedAt: at,
            receivedBy: s.actorId,
            returnSource: {
              returnId: old.id,
              returnCode: old.code,
              packageId: old.packageId,
              packageCode: old.packageCode,
              distributionId: old.issue.id,
            },
          };
          // Transfer reservations atomically; immutable package/load/review snapshots remain.
          const closed = {
            ...a,
            state: "disassembled" as const,
            version: a.version + 1,
            updatedAt: at,
            disassembledAt: at,
            disassemblyReason: "RETURN " + old.code + ": " + reason,
          };
          await tx.releasePackage(p);
          await tx.updateAssembly(closed, a.version);
          await tx.replaceAssignments(closed);
          await tx.insertAssemblyVersion(closed);
          await tx.appendAudit({
            id: randomUUID(),
            ...s,
            entityId: closed.id,
            version: closed.version,
            requestId: randomUUID(),
            correlationRequestId: sterileUuid(input.requestId),
            at,
            action: "tray-assembly-disassembled",
            reason: closed.disassemblyReason,
          });
          await tx.insertProcessing(episode);
          await tx.reserveProcessing(episode);
          await tx.insertProcessingVersion(episode);
          await tx.appendAudit({
            id: randomUUID(),
            ...s,
            entityId: episode.id,
            version: 1,
            requestId: randomUUID(),
            correlationRequestId: sterileUuid(input.requestId),
            at,
            action: "processing-received",
            reason: "RETURN " + old.code,
          });
        }
        const r: ReturnRecord = {
          ...old,
          version: version + 1,
          updatedAt: at,
          state: episode ? "reprocessing" : "quarantined",
          disposition: {
            action: input.action,
            reason,
            reference,
            actorId: s.actorId,
            at,
          },
          episodeId: episode?.id ?? null,
          episodeCode: episode?.code ?? null,
        };
        await tx.updateReturn(r, version);
        await this.record(
          tx,
          s,
          r,
          input.requestId,
          at,
          "return-disposition",
          reason,
        );
        return r;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    r: ReturnRecord,
    requestId: string,
    at: string,
    action: SterileAuditEvent["action"],
    reason: string,
  ) {
    await tx.insertReturnVersion(r);
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
      const rows = await tx.listReturns(p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) ver(version);
    return this.repository.transaction(s, async (tx) => {
      const r =
        version === undefined
          ? await tx.findReturn(key)
          : await tx.findReturnVersion(key, version);
      if (!r) throw new SterileError("NOT_FOUND");
      return r;
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findReturn(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), page: p, hasMore: rows.length > 50 };
    });
  }
}
