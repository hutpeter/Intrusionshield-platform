import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  codeOf,
  field,
  pageOf,
  type SterileScope,
  type SterileTransaction,
  type Instrument,
} from "./foundation.js";
import type { ProcessingEpisode } from "./processing-types.js";
export interface LoanerInput {
  requestId: string;
  code: string;
  supplier: string;
  supplierReference: string;
  dueOn: string;
  location: string;
  custodian: string;
  reference: string;
  condition: string;
  note: string;
  contentsChecked: boolean;
  confirmed: boolean;
  items: { code: string; instrumentTypeId: string; serialNumber: string }[];
}
export interface LoanerRecord {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  supplier: string;
  supplierReference: string;
  dueOn: string;
  location: string;
  custodian: string;
  reference: string;
  condition: string;
  note: string;
  items: ProcessingEpisode["instruments"];
  episodeId: string;
  episodeCode: string;
  state: "received" | "returned";
  version: number;
  createdAt: string;
  updatedAt: string;
  receivedBy: string;
  handback: {
    recipient: string;
    reference: string;
    note: string;
    actorId: string;
    at: string;
    proof: {
      instrumentId: string;
      instrumentVersion: number;
      episodeId: string;
      episodeVersion: number;
    }[];
  } | null;
}
export type LoanerSummary = Omit<LoanerRecord, "items" | "handback"> & {
  count: number;
};
export interface LoanerReturnInput {
  requestId: string;
  version: number;
  instrumentIds: string[];
  recipient: string;
  reference: string;
  note: string;
  contentsChecked: boolean;
  confirmed: boolean;
}
export async function assertLoanerPresent(
  tx: SterileTransaction,
  i: Instrument,
) {
  if (i.externalOwnership) {
    const r = await tx.findLoaner(i.externalOwnership.loanerId);
    if (!r || r.state !== "received")
      throw new SterileError("LOANER_UNAVAILABLE");
  }
}
export class LoanerRegistry extends SterileRegistryBase {
  async receive(scope: SterileScope, input: LoanerInput) {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      supplier = field(input.supplier, 200),
      supplierReference = field(input.supplierReference, 200),
      location = field(input.location, 200),
      custodian = field(input.custodian, 200),
      reference = field(input.reference, 200),
      condition = field(input.condition, 200),
      note = field(input.note, 500, false),
      dueOn = field(input.dueOn, 10, false);
    if (
      input.confirmed !== true ||
      input.contentsChecked !== true ||
      !Array.isArray(input.items) ||
      input.items.length < 1 ||
      input.items.length > 100
    )
      throw new SterileError("INVALID_REQUEST");
    if (
      dueOn &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) ||
        !Number.isFinite(Date.parse(dueOn)) ||
        new Date(dueOn).toISOString().slice(0, 10) !== dueOn)
    )
      throw new SterileError("INVALID_REQUEST");
    if (
      input.items.some(
        (row) => !row || typeof row !== "object" || Array.isArray(row),
      )
    )
      throw new SterileError("INVALID_REQUEST");
    const items = input.items.map((i) => ({
      code: codeOf(i.code),
      instrumentTypeId: sterileUuid(i.instrumentTypeId),
      serialNumber: field(i.serialNumber, 100, false),
    }));
    if (new Set(items.map((i) => i.code)).size !== items.length)
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "loaner-received",
      input,
      async (tx, at) => {
        if (
          (await tx.findLoanerByCode(code)) ||
          (await tx.findProcessingByCode(code))
        )
          throw new SterileError("CONFLICT");
        const id = randomUUID(),
          members: ProcessingEpisode["instruments"] = [];
        for (const row of items) {
          const type = await tx.findType(row.instrumentTypeId);
          if (!type) throw new SterileError("NOT_FOUND");
          if (await tx.findInstrumentByCode(row.code))
            throw new SterileError("CONFLICT");
          const i: Instrument = {
            tenantId: s.tenantId,
            facilityId: s.facilityId,
            id: randomUUID(),
            ownerFacilityId: s.facilityId,
            instrumentTypeId: type.id,
            code: row.code,
            serialNumber: row.serialNumber,
            state: "registered",
            createdAt: at,
            updatedAt: at,
            retiredAt: null,
            retirementReason: null,
            version: 1,
            externalOwnership: {
              kind: "loaner",
              loanerId: id,
              loanerCode: code,
              supplier,
              supplierReference,
            },
          };
          await tx.insertInstrument(i);
          await tx.appendAudit({
            id: randomUUID(),
            ...s,
            entityId: i.id,
            version: 1,
            requestId: randomUUID(),
            correlationRequestId: sterileUuid(input.requestId),
            at,
            action: "instrument-registered",
            reason: "Loaner " + code + " · " + supplier,
          });
          members.push({
            id: i.id,
            code: i.code,
            serialNumber: i.serialNumber,
            instrumentTypeId: type.id,
            instrumentTypeName: type.name,
            instrumentVersion: 1,
          });
        }
        const episode: ProcessingEpisode = {
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          id: randomUUID(),
          code,
          source: "LOANER " + code,
          custodian,
          condition,
          discrepancies: note,
          instruments: members,
          state: "received",
          attempts: [],
          inspections: [],
          version: 1,
          createdAt: at,
          updatedAt: at,
          receivedBy: s.actorId,
          loanerSource: { id, code },
        };
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
          reason: "Loaner " + code,
        });
        const r: LoanerRecord = {
          id,
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          supplier,
          supplierReference,
          dueOn,
          location,
          custodian,
          reference,
          condition,
          note,
          items: members,
          episodeId: episode.id,
          episodeCode: code,
          state: "received",
          version: 1,
          createdAt: at,
          updatedAt: at,
          receivedBy: s.actorId,
          handback: null,
        };
        await tx.insertLoaner(r);
        await tx.insertLoanerVersion(r);
        await this.record(
          tx,
          s,
          r,
          input.requestId,
          at,
          "loaner-received",
          reference,
        );
        return r;
      },
    );
  }
  async returnToSupplier(
    scope: SterileScope,
    id: string,
    input: LoanerReturnInput,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      recipient = field(input.recipient, 200),
      reference = field(input.reference, 200),
      note = field(input.note, 500, false);
    if (
      input.confirmed !== true ||
      input.contentsChecked !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1 ||
      !Array.isArray(input.instrumentIds) ||
      input.instrumentIds.length > 100
    )
      throw new SterileError("INVALID_REQUEST");
    const ids = input.instrumentIds.map(sterileUuid);
    if (new Set(ids).size !== ids.length)
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      "loaner-returned",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findLoaner(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (old.version !== input.version || old.state !== "received")
          throw new SterileError("CONFLICT");
        if (
          ids.length !== old.items.length ||
          old.items.some((i) => !ids.includes(i.id))
        )
          throw new SterileError("LOANER_UNAVAILABLE");
        const proof: NonNullable<LoanerRecord["handback"]>["proof"] = [];
        for (const member of old.items) {
          const i = await tx.findInstrument(member.id);
          if (
            !i ||
            i.state !== "registered" ||
            i.externalOwnership?.loanerId !== old.id
          )
            throw new SterileError("LOANER_UNAVAILABLE");
          if (
            (await tx.findActiveAssignment(i.id)) ||
            (await tx.findProcessingHold(i.id)) ||
            (await tx.findInstrumentRecallBlock(i.id))
          )
            throw new SterileError("LOANER_UNAVAILABLE");
          for (const c of await tx.listInstrumentRecallCases(i.id))
            if (!c.lineage || !(await tx.findRecallReadmission(c.id, i.id)))
              throw new SterileError("RECALL_BLOCKED");
          const e = await tx.findLatestProcessing(i.id);
          if (
            !e ||
            e.state !== "ready_for_assembly" ||
            e.inspections?.at(-1)?.outcome !== "passed" ||
            e.instruments.find((m) => m.id === i.id)?.instrumentVersion !==
              i.version
          )
            throw new SterileError("LOANER_UNAVAILABLE");
          proof.push({
            instrumentId: i.id,
            instrumentVersion: i.version,
            episodeId: e.id,
            episodeVersion: e.version,
          });
        }
        const r: LoanerRecord = {
          ...old,
          state: "returned",
          version: old.version + 1,
          updatedAt: at,
          handback: {
            recipient,
            reference,
            note,
            actorId: s.actorId,
            at,
            proof,
          },
        };
        await tx.updateLoaner(r, old.version);
        await tx.insertLoanerVersion(r);
        await this.record(
          tx,
          s,
          r,
          input.requestId,
          at,
          "loaner-returned",
          reference,
        );
        return r;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    r: LoanerRecord,
    requestId: string,
    at: string,
    action: "loaner-received" | "loaner-returned",
    reason: string,
  ) {
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
      n = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listLoaners(n);
      return { items: rows.slice(0, 50), page: n, hasMore: rows.length > 50 };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (
      version !== undefined &&
      (!Number.isSafeInteger(version) || version < 1)
    )
      throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      const r =
        version === undefined
          ? await tx.findLoaner(key)
          : await tx.findLoanerVersion(key, version);
      if (!r) throw new SterileError("NOT_FOUND");
      return r;
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      n = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findLoaner(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, n);
      return { items: rows.slice(0, 50), page: n, hasMore: rows.length > 50 };
    });
  }
}
