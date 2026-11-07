import { assertLoanerPresent } from "./loaners.js";
import { resetServiceBaseline } from "./service-usage.js";
import { randomUUID } from "node:crypto";
import {
  SterileRegistryBase,
  SterileError,
  scopeOf,
  sterileUuid,
  field,
  codeOf,
  type SterileScope,
  type Instrument,
} from "./foundation.js";
import type { ProcessingEpisode } from "./processing-types.js";
export interface MaintenanceEntry {
  id: string;
  defect: string;
  location: string;
  reportedAt: string;
  reportedBy: string;
  assessment?: { note: string; evidence: string; at: string; actorId: string };
  repair?: {
    note: string;
    evidence: string;
    provider: string;
    at: string;
    actorId: string;
  };
  authorization?: {
    reason: string;
    evidence: string;
    procedure: string;
    procedureVersion: string;
    at: string;
    actorId: string;
    episodeId: string;
    episodeCode: string;
  };
}
export interface MaintenanceInput {
  requestId: string;
  version: number;
  confirmed: boolean;
}
export type MaintenanceReportInput = MaintenanceInput & {
  defect: string;
  location: string;
};
export type MaintenanceAssessmentInput = MaintenanceInput & {
  note: string;
  evidence: string;
};
export type MaintenanceRepairInput = MaintenanceAssessmentInput & {
  provider: string;
};
export type MaintenanceReturnInput = MaintenanceInput & {
  reason: string;
  evidence: string;
  procedure: string;
  procedureVersion: string;
  code: string;
  custodian: string;
  location: string;
  functionalChecked: boolean;
};
export class MaintenanceRegistry extends SterileRegistryBase {
  private async mutate(
    scope: SterileScope,
    id: string,
    input: MaintenanceInput,
    action:
      | "maintenance-reported"
      | "maintenance-assessed"
      | "maintenance-repaired"
      | "maintenance-authorized",
    values: Record<string, string>,
    functionalChecked = false,
  ) {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (
      input.confirmed !== true ||
      !Number.isSafeInteger(input.version) ||
      input.version < 1
    )
      throw new SterileError("INVALID_REQUEST");
    if (action === "maintenance-authorized" && !functionalChecked)
      throw new SterileError("INVALID_REQUEST");
    return this.command(
      s,
      input.requestId,
      action,
      { id: key, version: input.version, ...values, functionalChecked },
      async (tx, at) => {
        const old = await tx.findInstrument(key);
        if (!old) throw new SterileError("NOT_FOUND");
        await assertLoanerPresent(tx, old);
        if (old.version !== input.version) throw new SterileError("CONFLICT");
        const entries = structuredClone(old.maintenance ?? []),
          entry = entries.at(-1);
        if (action === "maintenance-reported") {
          if (old.state !== "registered" || entries.length >= 100)
            throw new SterileError("CONFLICT");
        } else if (old.state !== "maintenance" || !entry || entry.authorization)
          throw new SterileError("CONFLICT");
        if (await tx.findActiveAssignment(key))
          throw new SterileError("INSTRUMENT_ASSIGNED");
        if (await tx.findProcessingHold(key))
          throw new SterileError("PROCESSING_HOLD");
        if (await tx.findInstrumentRecallBlock(key))
          throw new SterileError("RECALL_BLOCKED");
        // Also respect legacy package recalls whose instrument block has not been upgraded.
        for (const r of await tx.listInstrumentRecallCases(key)) {
          if (!r.lineage || !(await tx.findRecallReadmission(r.id, key)))
            throw new SterileError("RECALL_BLOCKED");
        }
        let state: Instrument["state"] = "maintenance";
        if (action === "maintenance-reported")
          entries.push({
            id: randomUUID(),
            defect: values.defect!,
            location: values.location!,
            reportedAt: at,
            reportedBy: s.actorId,
          });
        else if (action === "maintenance-assessed") {
          if (entry!.assessment) throw new SterileError("CONFLICT");
          entry!.assessment = {
            note: values.note!,
            evidence: values.evidence!,
            at,
            actorId: s.actorId,
          };
        } else if (action === "maintenance-repaired") {
          if (!entry!.assessment || entry!.repair)
            throw new SterileError("CONFLICT");
          entry!.repair = {
            note: values.note!,
            evidence: values.evidence!,
            provider: values.provider!,
            at,
            actorId: s.actorId,
          };
        } else {
          if (!entry!.repair) throw new SterileError("CONFLICT");
          const code = codeOf(values.code);
          if (await tx.findProcessingByCode(code))
            throw new SterileError("CONFLICT");
          const t = await tx.findType(old.instrumentTypeId);
          if (!t) throw new SterileError("NOT_FOUND");
          const episode: ProcessingEpisode = {
            id: randomUUID(),
            tenantId: s.tenantId,
            facilityId: s.facilityId,
            code,
            source: values.location!,
            custodian: values.custodian!,
            condition: values.reason!,
            discrepancies: "",
            maintenanceSource: {
              instrumentId: key,
              maintenanceId: entry!.id,
              procedure: values.procedure!,
              procedureVersion: values.procedureVersion!,
            },
            instruments: [
              {
                id: key,
                code: old.code,
                serialNumber: old.serialNumber,
                instrumentTypeId: t.id,
                instrumentTypeName: t.name,
                instrumentVersion: old.version + 1,
              },
            ],
            state: "received",
            attempts: [],
            inspections: [],
            version: 1,
            createdAt: at,
            updatedAt: at,
            receivedBy: s.actorId,
          };
          entry!.authorization = {
            reason: values.reason!,
            evidence: values.evidence!,
            procedure: values.procedure!,
            procedureVersion: values.procedureVersion!,
            at,
            actorId: s.actorId,
            episodeId: episode.id,
            episodeCode: code,
          };
          await tx.insertProcessing(episode);
          await tx.insertProcessingVersion(episode);
          await tx.reserveProcessing(episode);
          await tx.appendAudit({
            id: randomUUID(),
            ...s,
            at,
            action: "processing-received",
            entityId: episode.id,
            version: 1,
            requestId: randomUUID(),
            correlationRequestId: sterileUuid(input.requestId),
            reason: `Maintenance ${entry!.id}`,
          });
          await resetServiceBaseline(
            tx,
            s,
            key,
            at,
            sterileUuid(input.requestId),
            values.reason!,
          );
          state = "registered";
        }
        const item: Instrument = {
          ...old,
          state,
          maintenance: entries,
          version: old.version + 1,
          updatedAt: at,
        };
        await tx.updateInstrument(item, old.version);
        await tx.appendAudit({
          id: randomUUID(),
          ...s,
          at,
          action,
          entityId: key,
          version: item.version,
          requestId: sterileUuid(input.requestId),
          reason: Object.values(values).join(" · ").slice(0, 500),
        });
        return item;
      },
    );
  }
  async report(s: SterileScope, id: string, i: MaintenanceReportInput) {
    return this.mutate(s, id, i, "maintenance-reported", {
      defect: field(i.defect, 500),
      location: field(i.location, 200),
    });
  }
  async assess(s: SterileScope, id: string, i: MaintenanceAssessmentInput) {
    return this.mutate(s, id, i, "maintenance-assessed", {
      note: field(i.note, 500),
      evidence: field(i.evidence, 200),
    });
  }
  async repair(s: SterileScope, id: string, i: MaintenanceRepairInput) {
    return this.mutate(s, id, i, "maintenance-repaired", {
      note: field(i.note, 500),
      evidence: field(i.evidence, 200),
      provider: field(i.provider, 200),
    });
  }
  async authorizeReturn(
    s: SterileScope,
    id: string,
    i: MaintenanceReturnInput,
  ) {
    return this.mutate(
      s,
      id,
      i,
      "maintenance-authorized",
      {
        reason: field(i.reason, 500),
        evidence: field(i.evidence, 200),
        procedure: field(i.procedure, 200),
        procedureVersion: field(i.procedureVersion, 100),
        code: codeOf(i.code),
        custodian: field(i.custodian, 200),
        location: field(i.location, 200),
      },
      i.functionalChecked === true,
    );
  }
}
