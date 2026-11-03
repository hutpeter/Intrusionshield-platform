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
  type SterileAuditEvent,
} from "./foundation.js";
import type {
  ProcessingEpisode,
  ReceiveInput,
  StartCleaningInput,
  FinishCleaningInput,
} from "./processing-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const expected = (v: number) => {
  if (!Number.isSafeInteger(v) || v < 1) invalid();
  return v;
};
export class ProcessingRegistry extends SterileRegistryBase {
  async receive(
    scope: SterileScope,
    input: ReceiveInput,
  ): Promise<ProcessingEpisode> {
    const s = scopeOf(scope),
      code = codeOf(input.code),
      source = field(input.source, 200),
      custodian = field(input.custodian, 200),
      condition = field(input.condition, 500),
      discrepancies = field(input.discrepancies, 500, false);
    if (
      input.confirmed !== true ||
      !Array.isArray(input.instrumentIds) ||
      input.instrumentIds.length < 1 ||
      input.instrumentIds.length > 100
    )
      invalid();
    const ids = input.instrumentIds.map(sterileUuid);
    if (new Set(ids).size !== ids.length) invalid();
    return this.command(
      s,
      input.requestId,
      "processing-received",
      input,
      async (tx, at) => {
        if (await tx.findProcessingByCode(code))
          throw new SterileError("CONFLICT");
        const instruments: ProcessingEpisode["instruments"] = [];
        for (const id of ids) {
          const i = await tx.findInstrument(id);
          if (!i) throw new SterileError("NOT_FOUND");
          if (i.state !== "registered") throw new SterileError("CONFLICT");
          if (await tx.findActiveAssignment(id))
            throw new SterileError("INSTRUMENT_ASSIGNED");
          if (await tx.findProcessingHold(id))
            throw new SterileError("PROCESSING_HOLD");
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
        const item: ProcessingEpisode = {
          id: randomUUID(),
          tenantId: s.tenantId,
          facilityId: s.facilityId,
          code,
          source,
          custodian,
          condition,
          discrepancies,
          instruments,
          state: "received",
          attempts: [],
          version: 1,
          createdAt: at,
          updatedAt: at,
          receivedBy: s.actorId,
        };
        await tx.insertProcessing(item);
        await tx.reserveProcessing(item);
        await this.record(
          tx,
          s,
          item,
          "processing-received",
          input.requestId,
          at,
          "",
        );
        return item;
      },
    );
  }
  async start(scope: SterileScope, id: string, input: StartCleaningInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = expected(input.version);
    if (
      input.confirmed !== true ||
      !["manual", "mechanical"].includes(input.method)
    )
      invalid();
    const procedure = field(input.procedure, 200),
      procedureVersion = field(input.procedureVersion, 100),
      equipment = field(input.equipment, 200, input.method === "mechanical");
    return this.command(
      s,
      input.requestId,
      "cleaning-started",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findProcessing(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.version !== version ||
          !["received", "cleaning_failed"].includes(old.state) ||
          old.attempts.length >= 50
        )
          throw new SterileError("CONFLICT");
        const item: ProcessingEpisode = {
          ...old,
          state: "cleaning",
          version: version + 1,
          updatedAt: at,
          attempts: [
            ...old.attempts,
            {
              number: old.attempts.length + 1,
              method: input.method,
              procedure,
              procedureVersion,
              equipment,
              startedAt: at,
              startedBy: s.actorId,
              finishedAt: null,
              finishedBy: null,
              outcome: null,
              evidence: null,
              note: null,
            },
          ],
        };
        await tx.updateProcessing(item, version);
        await this.record(
          tx,
          s,
          item,
          "cleaning-started",
          input.requestId,
          at,
          "",
        );
        return item;
      },
    );
  }
  async finish(scope: SterileScope, id: string, input: FinishCleaningInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = expected(input.version);
    if (
      input.confirmed !== true ||
      !["passed", "failed"].includes(input.outcome)
    )
      invalid();
    const evidence = field(input.evidence, 500),
      note = field(input.note, 500, input.outcome === "failed");
    return this.command(
      s,
      input.requestId,
      "cleaning-recorded",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findProcessing(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.version !== version ||
          old.state !== "cleaning" ||
          !old.attempts.length
        )
          throw new SterileError("CONFLICT");
        const item: ProcessingEpisode = {
          ...old,
          state:
            input.outcome === "passed"
              ? "awaiting_inspection"
              : "cleaning_failed",
          version: version + 1,
          updatedAt: at,
          attempts: old.attempts.map((a, n) =>
            n === old.attempts.length - 1
              ? {
                  ...a,
                  finishedAt: at,
                  finishedBy: s.actorId,
                  outcome: input.outcome,
                  evidence,
                  note,
                }
              : a,
          ),
        };
        await tx.updateProcessing(item, version);
        await this.record(
          tx,
          s,
          item,
          "cleaning-recorded",
          input.requestId,
          at,
          note,
        );
        return item;
      },
    );
  }
  private async record(
    tx: SterileTransaction,
    s: SterileScope,
    item: ProcessingEpisode,
    action: SterileAuditEvent["action"],
    requestId: string,
    at: string,
    reason: string,
  ) {
    await tx.insertProcessingVersion(item);
    await tx.appendAudit({
      id: randomUUID(),
      ...s,
      entityId: item.id,
      version: item.version,
      action,
      requestId: sterileUuid(requestId),
      at,
      reason,
    });
  }
  async list(scope: SterileScope, page = 1) {
    const s = scopeOf(scope),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      const rows = await tx.listProcessing(p);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50, page: p };
    });
  }
  async get(scope: SterileScope, id: string, version?: number) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (version !== undefined) expected(version);
    return this.repository.transaction(s, async (tx) => {
      const row =
        version === undefined
          ? await tx.findProcessing(key)
          : await tx.findProcessingVersion(key, version);
      if (!row) throw new SterileError("NOT_FOUND");
      return row;
    });
  }
  async history(scope: SterileScope, id: string, page = 1) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      p = pageOf(page);
    return this.repository.transaction(s, async (tx) => {
      if (!(await tx.findProcessing(key))) throw new SterileError("NOT_FOUND");
      const rows = await tx.listAudit(key, p);
      return { items: rows.slice(0, 50), hasMore: rows.length > 50, page: p };
    });
  }
}
