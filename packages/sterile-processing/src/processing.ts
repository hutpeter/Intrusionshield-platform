import { resolveEquipment } from "./equipment.js";
import { resolveProcedure } from "./procedures.js";
import { assertLoanerPresent } from "./loaners.js";
import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  instrumentIdFromScan,
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
  ScannedReceiveInput,
  ReceiveInput,
  StartCleaningInput,
  FinishCleaningInput,
  InspectInput,
  InspectionItem,
} from "./processing-types.js";
const invalid = (): never => {
  throw new SterileError("INVALID_REQUEST");
};
const expected = (v: number) => {
  if (!Number.isSafeInteger(v) || v < 1) invalid();
  return v;
};
export class ProcessingRegistry extends SterileRegistryBase {
  async receiveScanned(
    scope: SterileScope,
    input: ScannedReceiveInput,
  ): Promise<ProcessingEpisode> {
    const { scannedIdentifiers, ...receipt } = input;
    if (
      !Array.isArray(scannedIdentifiers) ||
      scannedIdentifiers.length < 1 ||
      scannedIdentifiers.length > 100 ||
      !Array.isArray(receipt.instrumentIds)
    )
      invalid();
    const ids = scannedIdentifiers.map(instrumentIdFromScan),
      members = receipt.instrumentIds.map(sterileUuid);
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !members.includes(id))
    )
      invalid();
    return this.receiveInternal(scope, receipt, ids);
  }

  async receive(
    scope: SterileScope,
    input: ReceiveInput,
  ): Promise<ProcessingEpisode> {
    return this.receiveInternal(scope, input);
  }
  private async receiveInternal(
    scope: SterileScope,
    input: ReceiveInput,
    scannedIds?: string[],
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
      scannedIds ? { ...input, scannedIds } : input,
      async (tx, at) => {
        if (await tx.findProcessingByCode(code))
          throw new SterileError("CONFLICT");
        const instruments: ProcessingEpisode["instruments"] = [];
        for (const id of ids) {
          const i = await tx.findInstrument(id);
          if (!i) throw new SterileError("NOT_FOUND");
          if (i.incidentHold) throw new SterileError("CONFLICT");
          await assertLoanerPresent(tx, i);
          if (i.state !== "registered")
            throw new SterileError(scannedIds ? "SCAN_INELIGIBLE" : "CONFLICT");
          if (scannedIds) {
            if (await tx.findInstrumentRecallBlock(id))
              throw new SterileError("RECALL_BLOCKED");
            for (const recall of await tx.listInstrumentRecallCases(id))
              if (
                !recall.lineage ||
                !(await tx.findRecallReadmission(recall.id, id))
              )
                throw new SterileError("RECALL_BLOCKED");
          }
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
          ...(scannedIds
            ? {
                receivingScans: scannedIds.map((instrumentId) => ({
                  instrumentId,
                  identifier: "RSP-I-" + instrumentId.toUpperCase(),
                })),
              }
            : {}),
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
          inspections: [],
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
          scannedIds
            ? `Confirmed receiving with internal scan identifiers: ${scannedIds.length}`
            : "",
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
          !["received", "cleaning_failed", "inspection_failed"].includes(
            old.state,
          ) ||
          old.attempts.length >= 50
        )
          throw new SterileError("CONFLICT");
        if (input.method === "manual" && input.equipmentId !== undefined)
          throw new SterileError("INVALID_REQUEST");
        const registeredEquipment =
          input.method === "mechanical"
            ? await resolveEquipment(
                tx,
                input.equipmentId,
                "washer_disinfector",
                input.method,
                equipment,
                at,
              )
            : undefined;
        const controlledProcedure = await resolveProcedure(
          tx,
          input.procedureRevisionId,
          "cleaning",
          input.method,
          old.instruments.map((i) => i.instrumentTypeId),
          procedure,
          procedureVersion,
        );
        const item: ProcessingEpisode = {
          ...old,
          state: "cleaning",
          version: version + 1,
          updatedAt: at,
          attempts: [
            ...old.attempts,
            {
              ...(registeredEquipment ? { registeredEquipment } : {}),
              ...(controlledProcedure ? { controlledProcedure } : {}),
              number: old.attempts.length + 1,
              method: input.method,
              procedure,
              procedureVersion,
              equipment,
              startedAt: at,
              startedBy: s.actorId,
              startedByPersonId: s.personId ?? s.actorId,
              finishedAt: null,
              finishedBy: null,
              finishedByPersonId: null,
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
                  finishedByPersonId: s.personId ?? s.actorId,
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
  async inspect(scope: SterileScope, id: string, input: InspectInput) {
    const s = scopeOf(scope),
      key = sterileUuid(id),
      version = expected(input.version);
    if (
      input.confirmed !== true ||
      !Array.isArray(input.items) ||
      !input.items.length ||
      input.items.length > 100
    )
      invalid();
    const procedure = field(input.procedure, 200),
      procedureVersion = field(input.procedureVersion, 100),
      evidence = field(input.evidence, 500);
    const items: InspectionItem[] = input.items.map((row) => {
      if (
        !row ||
        typeof row !== "object" ||
        Object.keys(row).some(
          (k) =>
            ![
              "instrumentId",
              "clean",
              "dry",
              "intact",
              "functional",
              "note",
            ].includes(k),
        ) ||
        ["clean", "dry", "intact", "functional"].some(
          (k) => typeof row[k as keyof InspectionItem] !== "boolean",
        )
      )
        invalid();
      return {
        instrumentId: sterileUuid(row.instrumentId),
        clean: row.clean,
        dry: row.dry,
        intact: row.intact,
        functional: row.functional,
        note: field(
          row.note,
          500,
          !(row.clean && row.dry && row.intact && row.functional),
        ),
      };
    });
    if (new Set(items.map((row) => row.instrumentId)).size !== items.length)
      invalid();
    return this.command(
      s,
      input.requestId,
      "inspection-recorded",
      { ...input, id: key },
      async (tx, at) => {
        const old = await tx.findProcessing(key);
        if (!old) throw new SterileError("NOT_FOUND");
        if (
          old.version !== version ||
          old.state !== "awaiting_inspection" ||
          old.attempts.at(-1)?.outcome !== "passed" ||
          (old.inspections?.length ?? 0) >= 50
        )
          throw new SterileError("CONFLICT");
        if (
          items.length !== old.instruments.length ||
          items.some(
            (row) => !old.instruments.some((i) => i.id === row.instrumentId),
          )
        )
          invalid();
        const personId = s.personId ?? s.actorId;
        // Inspect inside the same transaction/version check that saves evidence and releases holds.
        // Include failed/retried attempts and both start/finish participants, not just the last finisher.
        for (const attempt of old.attempts) {
          if (
            attempt.startedBy === s.actorId ||
            attempt.finishedBy === s.actorId ||
            attempt.startedByPersonId === personId ||
            attempt.finishedByPersonId === personId
          )
            throw new SterileError("SELF_INSPECTION");
          if (!attempt.startedByPersonId || !attempt.finishedByPersonId)
            throw new SterileError("INSPECTION_IDENTITY_REQUIRED");
          try {
            sterileUuid(attempt.startedByPersonId);
            sterileUuid(attempt.finishedByPersonId);
          } catch {
            throw new SterileError("INSPECTION_IDENTITY_REQUIRED");
          }
        }
        for (const i of old.instruments) {
          const hold = await tx.findProcessingHold(i.id);
          if (hold?.episodeId !== old.id) throw new SterileError("CONFLICT");
        }
        const outcome = items.every(
          (row) => row.clean && row.dry && row.intact && row.functional,
        )
          ? "passed"
          : "failed";
        if (outcome === "passed")
          for (const i of old.instruments)
            if (await tx.findInstrumentRecallBlock(i.id))
              throw new SterileError("RECALL_BLOCKED");
        const controlledProcedure = await resolveProcedure(
          tx,
          input.procedureRevisionId,
          "inspection",
          "inspection",
          old.instruments.map((i) => i.instrumentTypeId),
          procedure,
          procedureVersion,
        );
        const item: ProcessingEpisode = {
          ...old,
          version: version + 1,
          updatedAt: at,
          state:
            outcome === "passed" ? "ready_for_assembly" : "inspection_failed",
          inspections: [
            ...(old.inspections ?? []),
            {
              ...(controlledProcedure ? { controlledProcedure } : {}),
              number: (old.inspections?.length ?? 0) + 1,
              cleaningAttempt: old.attempts.length,
              procedure,
              procedureVersion,
              evidence,
              items,
              outcome,
              at,
              actorId: s.actorId,
              personId,
            },
          ],
        };
        await tx.updateProcessing(item, version);
        if (outcome === "passed") await tx.releaseProcessing(item);
        await this.record(
          tx,
          s,
          item,
          "inspection-recorded",
          input.requestId,
          at,
          "",
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
      const items = await Promise.all(
        rows.slice(0, 50).map(async (r) => {
          const blocks = await Promise.all(
            r.instruments.map((i) => tx.findInstrumentRecallBlock(i.id)),
          );
          return {
            ...r,
            ...(blocks.some(Boolean) ? { recallBlocked: true } : {}),
          };
        }),
      );
      return { items, hasMore: rows.length > 50, page: p };
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
      const blocks =
        version === undefined
          ? await Promise.all(
              row.instruments.map((i) => tx.findInstrumentRecallBlock(i.id)),
            )
          : [];
      return {
        ...row,
        ...(blocks.some(Boolean) ? { recallBlocked: true } : {}),
      };
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
