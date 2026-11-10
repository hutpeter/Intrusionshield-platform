import { shelfLifeState } from "./package-safety.js";
import { serviceDue } from "./service-usage.js";
import {
  SterileError,
  scopeOf,
  sterileUuid,
  codeOf,
  type SterileScope,
  type SterileRepository,
} from "./foundation.js";
import type {
  TraceKind,
  TraceRootKind,
  TraceFilter,
  TraceRow,
  TraceReport,
  TraceNode,
  TraceLink,
  TraceField,
  TraceFact,
  TraceSource,
} from "./trace-types.js";
import type { TrayAssembly } from "./tray-types.js";
import type { SterilePackage } from "./packaging-types.js";
import type { SterilizationLoad } from "./cycle-types.js";
import type { ProcessingEpisode } from "./processing-types.js";
import type { LoadReview } from "./review-types.js";
import type { DistributionRecord } from "./distribution-types.js";
import type { ReturnRecord } from "./return-types.js";
import type { RecallRecord } from "./recall-types.js";
const roots = ["instrument", "definition", "assembly", "package", "load"];
export const traceCode = (r: TraceSource) =>
  "code" in r
    ? r.code
    : "loadSnapshot" in r
      ? r.loadSnapshot.code
      : r.packageCode;
const version = (r: TraceSource) => r.version;
const fields = (o: object, keys: string[]): TraceField[] =>
  keys
    .filter((k) => k in o)
    .map((key) => ({
      key,
      value:
        (o as Record<string, string | number | boolean | null>)[key] ?? null,
    }));
const unique = (ids: string[]) => [...new Set(ids)];
export class TraceabilityRegistry {
  constructor(private repository: SterileRepository) {}
  async search(scope: SterileScope, code: string) {
    const s = scopeOf(scope),
      q = codeOf(code);
    return this.repository.transaction(s, (tx) => tx.searchTraceCode(q));
  }
  async report(
    scope: SterileScope,
    kind: TraceRootKind,
    id: string,
  ): Promise<TraceReport> {
    const s = scopeOf(scope),
      key = sterileUuid(id);
    if (!roots.includes(kind)) throw new SterileError("INVALID_REQUEST");
    return this.repository.transaction(s, async (tx) => {
      const all = new Map<string, TraceRow>();
      const collect = async (k: TraceKind, f: TraceFilter) => {
        const rows = await tx.traceRows(k, f);
        for (const r of rows) {
          if (
            r.kind !== k ||
            r.record.tenantId !== s.tenantId ||
            r.record.facilityId !== s.facilityId
          )
            throw new Error("Trace source scope mismatch");
          all.set(k + ":" + r.record.id + ":" + version(r.record), r);
        }
        if (all.size > 1000 || rows.length > 1000)
          throw new SterileError("TRACE_LIMIT");
        return rows;
      };
      const root = await collect(kind, { ids: [key] });
      if (!root.length) throw new SterileError("NOT_FOUND");
      const current = root.find((x) => x.current);
      if (!current) throw new SterileError("NOT_FOUND");
      let assemblies: TraceRow[] = kind === "assembly" ? root : [],
        packages: TraceRow[] = kind === "package" ? root : [];
      if (kind === "definition")
        assemblies = await collect("assembly", { definitionIds: [key] });
      if (kind === "load") {
        const ids = unique(
          root.flatMap((r) =>
            (r.record as SterilizationLoad).packages.map((p) => p.id),
          ),
        );
        if (ids.length) packages = await collect("package", { ids });
      }
      const instruments = unique(
        kind === "instrument"
          ? [key]
          : [
              ...assemblies.flatMap((r) =>
                (r.record as TrayAssembly).instruments.map((i) => i.id),
              ),
              ...packages.flatMap((r) =>
                (r.record as SterilePackage).assemblySnapshot.instruments.map(
                  (i) => i.id,
                ),
              ),
            ],
      );
      if (instruments.length) {
        await collect("instrument", { ids: instruments });
        await collect("processing", { instrumentIds: instruments });
        await collect("assembly", { instrumentIds: instruments });
        await collect("package", { instrumentIds: instruments });
      }
      const by = (k: TraceKind) =>
        [...all.values()].filter((r) => r.kind === k);
      const definitions = unique(
        by("assembly").map((r) => (r.record as TrayAssembly).definitionId),
      );
      if (definitions.length) await collect("definition", { ids: definitions });
      const packageIds = unique(by("package").map((r) => r.record.id));
      if (packageIds.length) {
        await collect("load", { packageIds });
        await collect("distribution", { packageIds });
        await collect("return", { packageIds });
        await collect("recall", { packageIds });
      }
      const loadIds = unique(by("load").map((r) => r.record.id));
      if (loadIds.length) await collect("review", { loadIds });
      // A returned episode is selected through the same instrument IDs, not through co-loaded packages.
      const nodes = new Map<string, TraceNode>(),
        links: TraceLink[] = [];
      const link = (
        r: TraceRow,
        toKind: TraceKind,
        toId: string,
        toVersion: number | null,
        relation: string,
      ) => {
        links.push({
          fromKind: r.kind,
          fromId: r.record.id,
          fromVersion: r.record.version,
          toKind,
          toId,
          toVersion,
          relation,
        });
      };
      for (const row of all.values()) {
        const r = row.record,
          nodeKey = row.kind + ":" + r.id;
        let node = nodes.get(nodeKey);
        if (!node) {
          node = {
            kind: row.kind,
            id: r.id,
            code: traceCode(r),
            version: r.version,
            state: "state" in r ? r.state : null,
            snapshots: [],
          };
          nodes.set(nodeKey, node);
        }
        if (row.current) {
          node.version = r.version;
          node.state = "state" in r ? r.state : null;
        }
        const scalar = fields(r, [
          "name",
          "state",
          "serialNumber",
          "source",
          "custodian",
          "condition",
          "discrepancies",
          "material",
          "materialLot",
          "procedure",
          "procedureVersion",
          "sealChecked",
          "contentsChecked",
          "sterilizer",
          "method",
          "profile",
          "profileVersion",
          "cycleReference",
          "outcome",
          "cycleEvidence",
          "indicatorEvidence",
          "note",
          "location",
          "destination",
          "recipient",
          "reference",
          "reason",
        ]);
        const facts: TraceFact[] = [];
        const fact = (
          kind: string,
          at: string | null,
          actorId: string | null,
          o: object,
          keys: string[],
        ) => facts.push({ kind, at, actorId, fields: fields(o, keys) });
        const equipmentFact = (
          kind: string,
          machine: import("./equipment.js").ProcessingEquipment,
          at: string,
          actorId: string,
        ) =>
          fact(
            kind,
            at,
            actorId,
            {
              equipmentId: machine.id,
              equipmentCode: machine.code,
              equipmentName: machine.name,
              equipmentVersion: machine.version,
              equipmentState: machine.state,
              equipmentKind: machine.kind,
              serialNumber: machine.serialNumber,
              serviceDueAt: machine.serviceDueAt,
              serviceReference: machine.serviceReference,
              qualificationDueAt: machine.qualificationDueAt,
              qualificationReference: machine.qualificationReference,
            },
            [
              "equipmentId",
              "equipmentCode",
              "equipmentName",
              "equipmentVersion",
              "equipmentState",
              "equipmentKind",
              "serialNumber",
              "serviceDueAt",
              "serviceReference",
              "qualificationDueAt",
              "qualificationReference",
            ],
          );
        if (row.kind === "instrument") {
          const i = r as import("./foundation.js").Instrument;
          if (i.externalOwnership)
            fact(
              "loaner_ownership",
              i.createdAt,
              null,
              {
                ...i.externalOwnership,
                loanerStatus:
                  (await tx.findLoaner(i.externalOwnership.loanerId))?.state ??
                  "unavailable",
              },
              [
                "supplier",
                "supplierReference",
                "loanerCode",
                "loanerId",
                "loanerStatus",
              ],
            );

          const usage = row.current ? await tx.findServiceUsage(i.id) : null;
          if (usage)
            fact(
              "service_usage",
              usage.updatedAt,
              null,
              {
                totalRecorded: usage.totalRecorded,
                sinceService: usage.totalRecorded - usage.serviceBaseline,
                interval: usage.interval,
                warningBefore: usage.warningBefore,
                reference: usage.reference,
                trackingStarted: usage.createdAt,
                lastServiceAt: usage.lastServiceAt,
                serviceVersion: usage.version,
                due: serviceDue(usage),
              },
              [
                "totalRecorded",
                "sinceService",
                "interval",
                "warningBefore",
                "reference",
                "trackingStarted",
                "lastServiceAt",
                "serviceVersion",
                "due",
              ],
            );
          for (const m of i.maintenance ?? []) {
            fact("maintenance-reported", m.reportedAt, m.reportedBy, m, [
              "defect",
              "location",
            ]);
            if (m.assessment)
              fact(
                "maintenance-assessed",
                m.assessment.at,
                m.assessment.actorId,
                m.assessment,
                ["note", "evidence"],
              );
            if (m.repair)
              fact(
                "maintenance-repaired",
                m.repair.at,
                m.repair.actorId,
                m.repair,
                ["note", "evidence", "provider"],
              );
            if (m.authorization) {
              fact(
                "maintenance-authorized",
                m.authorization.at,
                m.authorization.actorId,
                m.authorization,
                [
                  "reason",
                  "evidence",
                  "procedure",
                  "procedureVersion",
                  "episodeCode",
                ],
              );
              link(
                row,
                "processing",
                m.authorization.episodeId,
                1,
                "maintenance_receiving",
              );
            }
          }
        }
        if (row.kind === "assembly") {
          const a = r as TrayAssembly;
          link(
            row,
            "definition",
            a.definitionId,
            a.definitionRevision,
            "definition",
          );
          for (const i of a.instruments)
            if (instruments.includes(i.id))
              link(row, "instrument", i.id, i.instrumentVersion, "member");
        }
        if (row.kind === "processing") {
          const e = r as ProcessingEpisode;
          for (const a of e.attempts)
            if (a.registeredEquipment)
              equipmentFact(
                "equipment_start",
                a.registeredEquipment,
                a.startedAt,
                a.startedBy,
              );
          for (const a of e.attempts)
            if (a.controlledProcedure)
              fact(
                "controlled_procedure",
                a.startedAt,
                a.startedBy,
                {
                  procedureId: a.controlledProcedure.id,
                  procedureCode: a.controlledProcedure.code,
                  procedureRevision: a.controlledProcedure.revision,
                  procedureRecordVersion: a.controlledProcedure.version,
                  procedureStage: a.controlledProcedure.stage,
                  procedureSource: a.controlledProcedure.source,
                  procedureInstructions: a.controlledProcedure.instructions,
                  publishedAt: a.controlledProcedure.publishedAt,
                  publishedBy: a.controlledProcedure.publishedBy,
                },
                [
                  "procedureId",
                  "procedureCode",
                  "procedureRevision",
                  "procedureRecordVersion",
                  "procedureStage",
                  "procedureSource",
                  "procedureInstructions",
                  "publishedAt",
                  "publishedBy",
                ],
              );
          for (const a of e.inspections ?? [])
            if (a.controlledProcedure)
              fact(
                "controlled_procedure",
                a.at,
                a.actorId,
                {
                  procedureId: a.controlledProcedure.id,
                  procedureCode: a.controlledProcedure.code,
                  procedureRevision: a.controlledProcedure.revision,
                  procedureRecordVersion: a.controlledProcedure.version,
                  procedureStage: a.controlledProcedure.stage,
                  procedureSource: a.controlledProcedure.source,
                  procedureInstructions: a.controlledProcedure.instructions,
                  publishedAt: a.controlledProcedure.publishedAt,
                  publishedBy: a.controlledProcedure.publishedBy,
                },
                [
                  "procedureId",
                  "procedureCode",
                  "procedureRevision",
                  "procedureRecordVersion",
                  "procedureStage",
                  "procedureSource",
                  "procedureInstructions",
                  "publishedAt",
                  "publishedBy",
                ],
              );

          for (const i of e.instruments)
            if (instruments.includes(i.id))
              link(row, "instrument", i.id, i.instrumentVersion, "received");
          for (const scan of e.receivingScans ?? [])
            fact("receiving_scan", e.createdAt, e.receivedBy, scan, [
              "instrumentId",
              "identifier",
            ]);
          if (e.maintenanceSource)
            link(
              row,
              "instrument",
              e.maintenanceSource.instrumentId,
              null,
              "maintenance_source",
            );
          if (e.recallSource)
            for (const c of e.recallSource.clearances)
              link(row, "recall", c.caseId, c.version, "cleared_reprocessing");
          if (e.supersededBy)
            link(row, "processing", e.supersededBy, 1, "superseded_by");
          if (e.loanerSource)
            fact(
              "loaner_receiving_source",
              e.createdAt,
              e.receivedBy,
              {
                loanerId: e.loanerSource.id,
                loanerCode: e.loanerSource.code,
                visit: e.loanerSource.visit ?? 1,
              },
              ["loanerId", "loanerCode", "visit"],
            );
          if (e.returnSource)
            link(
              row,
              "return",
              e.returnSource.returnId,
              null,
              "reprocessed_from",
            );
          for (const a of e.attempts)
            fact(
              "cleaning",
              a.finishedAt ?? a.startedAt,
              a.finishedBy ?? a.startedBy,
              a,
              [
                "number",
                "method",
                "procedure",
                "procedureVersion",
                "equipment",
                "outcome",
                "evidence",
                "note",
              ],
            );
          for (const i of e.inspections ?? []) {
            fact("inspection", i.at, i.actorId, i, [
              "number",
              "cleaningAttempt",
              "outcome",
              "procedure",
              "procedureVersion",
              "evidence",
            ]);
            for (const item of i.items)
              if (instruments.includes(item.instrumentId))
                fact(
                  "inspection_item",
                  i.at,
                  i.actorId,
                  {
                    ...item,
                    code:
                      e.instruments.find((x) => x.id === item.instrumentId)
                        ?.code ?? item.instrumentId,
                  },
                  ["code", "clean", "dry", "intact", "functional", "note"],
                );
          }
        }
        if (row.kind === "package") {
          const p = r as SterilePackage;
          for (const usage of p.consumableUsage ?? [])
            fact("consumable_usage", p.createdAt, p.packedBy, usage, [
              "lotCode",
              "quantity",
              "unit",
              "movementId",
              "stockVersionBefore",
              "stockVersionAfter",
            ]);
          for (const lot of p.consumableLots ?? [])
            fact("consumable_lot", p.createdAt, p.packedBy, lot, [
              "id",
              "code",
              "kind",
              "name",
              "lotNumber",
              "supplier",
              "supplierReference",
              "expiresOn",
              "version",
            ]);
          if (p.shelfLife)
            fact("package_shelf_life", p.createdAt, p.packedBy, p.shelfLife, [
              "mode",
              "reference",
              "revision",
              "expiresAt",
              "warningDays",
            ]);
          const integrity = row.current
            ? await tx.findPackageIntegrity(p.id)
            : null;
          if (integrity)
            fact(
              "package_integrity_hold",
              integrity.at,
              integrity.actorId,
              integrity,
              ["reason", "evidence", "location", "packageVersion"],
            );
          link(
            row,
            "assembly",
            p.assemblyId,
            p.assemblyVersion,
            "packaged_from",
          );
          for (const proof of p.inspectionProofs)
            if (instruments.includes(proof.instrumentId))
              link(
                row,
                "processing",
                proof.episodeId,
                proof.episodeVersion,
                "inspection_proof",
              );
        }
        if (row.kind === "load") {
          const l = r as SterilizationLoad;
          if (l.registeredEquipment)
            equipmentFact(
              "equipment_draft",
              l.registeredEquipment,
              l.createdAt,
              l.createdBy,
            );
          if (l.startedEquipment)
            equipmentFact(
              "equipment_start",
              l.startedEquipment,
              l.startedAt!,
              l.startedBy!,
            );
          if (l.controlledProcedure)
            fact(
              "controlled_procedure",
              l.startedAt ?? l.createdAt,
              l.startedBy ?? l.createdBy,
              {
                procedureId: l.controlledProcedure.id,
                procedureCode: l.controlledProcedure.code,
                procedureRevision: l.controlledProcedure.revision,
                procedureRecordVersion: l.controlledProcedure.version,
                procedureStage: l.controlledProcedure.stage,
                procedureSource: l.controlledProcedure.source,
                procedureInstructions: l.controlledProcedure.instructions,
                publishedAt: l.controlledProcedure.publishedAt,
                publishedBy: l.controlledProcedure.publishedBy,
              },
              [
                "procedureId",
                "procedureCode",
                "procedureRevision",
                "procedureRecordVersion",
                "procedureStage",
                "procedureSource",
                "procedureInstructions",
                "publishedAt",
                "publishedBy",
              ],
            );

          for (const p of l.packages)
            if (packageIds.includes(p.id))
              link(row, "package", p.id, p.version, "load_member");
          scalar.push(
            { key: "packageCount", value: l.packages.length },
            {
              key: "matchedPackageCount",
              value: l.packages.filter((p) => packageIds.includes(p.id)).length,
            },
          );
        }
        if (row.kind === "review") {
          const v = r as LoadReview;
          link(row, "load", v.loadId, v.loadVersion, "review_of");
          for (const d of v.decisions)
            fact("decision", d.at, d.actorId, d, [
              "number",
              "decision",
              "reason",
              "reference",
              "cycleChecked",
              "indicatorsChecked",
              "packagesChecked",
              "profileChecked",
            ]);
        }
        if (row.kind === "distribution") {
          const d = r as DistributionRecord;
          link(row, "package", d.packageId, d.packageVersion, "custody_of");
          link(row, "load", d.loadId, d.loadVersion, "source_load");
          link(row, "review", d.reviewId, d.reviewVersion, "source_review");
          for (const e of d.events)
            fact("movement", e.at, e.actorId, e, [
              "number",
              "kind",
              "fromLocation",
              "toLocation",
              "destination",
              "recipient",
              "reference",
              "reason",
              "integrityChecked",
            ]);
        }
        if (row.kind === "return") {
          const ret = r as ReturnRecord;
          if (ret.reconciliation) {
            fact(
              "return_reconciliation",
              ret.updatedAt,
              null,
              {
                reason: ret.reconciliation.reason,
                received: ret.reconciliation.receivedInstrumentIds.length,
                missing: ret.reconciliation.missingInstrumentIds.length,
                receivedIds:
                  ret.reconciliation.receivedInstrumentIds.join(", "),
                missingIds: ret.reconciliation.missingInstrumentIds.join(", "),
              },
              ["reason", "received", "missing", "receivedIds", "missingIds"],
            );
            for (const receipt of ret.reconciliation.recoveries)
              fact(
                "return_missing_received",
                receipt.at,
                receipt.actorId,
                { ...receipt, instrumentIds: receipt.instrumentIds.join(", ") },
                ["instrumentIds", "location", "custodian", "reference", "note"],
              );
          }
          if (ret.scanReceipt)
            fact(
              "return_scan",
              ret.createdAt,
              ret.receivedBy,
              {
                identifier: ret.scanReceipt.identifier,
                count: ret.scanReceipt.contents.length,
              },
              ["identifier", "count"],
            );
          link(
            row,
            "package",
            ret.packageId,
            ret.packageVersion,
            "returned_package",
          );
          link(
            row,
            "distribution",
            ret.issue.id,
            ret.issue.version,
            "original_issue",
          );
          if (ret.episodeId)
            link(row, "processing", ret.episodeId, 1, "new_episode");
          if (ret.disposition)
            fact(
              "disposition",
              ret.disposition.at,
              ret.disposition.actorId,
              ret.disposition,
              ["action", "reason", "reference"],
            );
        }
        if (row.kind === "recall") {
          const recall = r as RecallRecord;
          if (recall.equipmentIncident)
            fact(
              "equipment_incident",
              recall.createdAt,
              recall.createdBy,
              recall.equipmentIncident,
              ["id", "code", "equipmentId", "equipmentCode", "from", "to"],
            );
          scalar.push({ key: "packageCount", value: recall.items.length });
          if (recall.clearance)
            fact(
              "clearance",
              recall.clearance.at,
              recall.clearance.actorId,
              recall.clearance,
              ["resolution", "evidence", "procedure", "procedureVersion"],
            );
          for (const a of recall.admissions ?? []) {
            fact("readmission", a.at, a.actorId, a, [
              "episodeCode",
              "location",
              "reference",
            ]);
            link(row, "processing", a.episodeId, 1, "new_episode");
          }
          for (const item of recall.items.filter((i) =>
            packageIds.includes(i.packageId),
          )) {
            link(
              row,
              "package",
              item.packageId,
              item.packageVersion,
              "recalled_package",
            );
            fact(
              "recall_member",
              recall.createdAt,
              recall.createdBy,
              { code: item.packageCode, status: item.status, ...item.atRecall },
              ["code", "status", "location", "destination", "recipient"],
            );
            if (item.recovery)
              fact(
                "recovery",
                item.recovery.at,
                item.recovery.actorId,
                { code: item.packageCode, ...item.recovery },
                ["code", "location", "reference", "note"],
              );
            if (item.disposition)
              fact(
                "disposition",
                item.disposition.at,
                item.disposition.actorId,
                { code: item.packageCode, ...item.disposition },
                ["code", "action", "reason", "reference"],
              );
          }
        }
        node.snapshots.push({
          version: r.version,
          current: row.current,
          fields: scalar,
          facts,
        });
      }
      const alerts: TraceReport["alerts"] = [];
      for (const i of by("instrument").filter((r) => r.current)) {
        if (
          (i.record as import("./foundation.js").Instrument).state ===
          "maintenance"
        )
          alerts.push({
            kind: "maintenance_hold",
            entityKind: "instrument",
            entityId: i.record.id,
            code: traceCode(i.record),
            reference:
              (
                i.record as import("./foundation.js").Instrument
              ).maintenance?.at(-1)?.id ?? "",
          });
        const owner = (i.record as import("./foundation.js").Instrument)
          .externalOwnership;
        if (
          owner &&
          (await tx.findLoaner(owner.loanerId))?.state === "returned"
        )
          alerts.push({
            kind: "loaner_returned",
            entityKind: "instrument",
            entityId: i.record.id,
            code: traceCode(i.record),
            reference: owner.loanerCode,
          });
        const serviceUsage = await tx.findServiceUsage(i.record.id);
        if (serviceDue(serviceUsage))
          alerts.push({
            kind: "service_due",
            entityKind: "instrument",
            entityId: i.record.id,
            code: traceCode(i.record),
            reference: serviceUsage!.reference,
          });
        const instrumentRecall = await tx.findInstrumentRecallBlock(
          i.record.id,
        );
        if (instrumentRecall)
          alerts.push({
            kind: "instrument_recall",
            entityKind: "instrument",
            entityId: i.record.id,
            code: traceCode(i.record),
            reference: instrumentRecall.caseCode,
          });
        const hold = await tx.findProcessingHold(i.record.id),
          assembly = await tx.findActiveAssignment(i.record.id);
        if (hold)
          alerts.push({
            kind: "processing_hold",
            entityKind: "instrument",
            entityId: i.record.id,
            code: traceCode(i.record),
            reference: hold.episodeCode,
          });
        if (assembly)
          alerts.push({
            kind: "active_assembly",
            entityKind: "instrument",
            entityId: i.record.id,
            code: traceCode(i.record),
            reference: assembly.assemblyCode,
          });
      }
      for (const p of by("package").filter((r) => r.current)) {
        const hold = await tx.findPackageIntegrity(p.record.id);
        if (hold)
          alerts.push({
            kind: "package_integrity_hold",
            entityKind: "package",
            entityId: p.record.id,
            code: traceCode(p.record),
            reference: hold.reason,
          });
        if (
          shelfLifeState((p.record as SterilePackage).shelfLife) === "expired"
        )
          alerts.push({
            kind: "package_expired",
            entityKind: "package",
            entityId: p.record.id,
            code: traceCode(p.record),
            reference: (p.record as SterilePackage).shelfLife!.expiresAt!,
          });
        const recall = await tx.findRecallBlock(p.record.id),
          ret = await tx.findReturnByPackage(p.record.id);
        if (recall)
          alerts.push({
            kind: "recall_block",
            entityKind: "package",
            entityId: p.record.id,
            code: traceCode(p.record),
            reference: recall.caseCode,
          });
        if (ret)
          alerts.push({
            kind: "return_block",
            entityKind: "package",
            entityId: p.record.id,
            code: traceCode(p.record),
            reference: ret.code,
          });
      }
      const events = await tx.traceAudit(
        unique([...nodes.values()].map((n) => n.id)),
      );
      if (events.length > 2000) throw new SterileError("TRACE_LIMIT");
      const seen = new Set<string>();
      const knownLinks = links.filter((l) => {
        const to = nodes.get(l.toKind + ":" + l.toId);
        const k = JSON.stringify(l);
        if (seen.has(k)) return false;
        seen.add(k);
        l.targetAvailable =
          !!to &&
          (l.toVersion === null ||
            to.snapshots.some((s) => s.version === l.toVersion));
        return true;
      });
      for (const node of nodes.values())
        node.snapshots.sort((a, b) => b.version - a.version);
      const report: TraceReport = {
        tenantId: s.tenantId,
        facilityId: s.facilityId,
        generatedAt: new Date().toISOString(),
        root: {
          kind,
          id: key,
          code: traceCode(current.record),
          version: current.record.version,
        },
        focusInstrumentIds: instruments,
        nodes: [...nodes.values()],
        links: knownLinks,
        events: events.sort((a, b) => a.at.localeCompare(b.at)),
        alerts,
        coverage: "recorded-links-only",
      };
      if (Buffer.byteLength(JSON.stringify(report), "utf8") > 8 * 1024 * 1024)
        throw new SterileError("TRACE_LIMIT");
      return report;
    });
  }
}
