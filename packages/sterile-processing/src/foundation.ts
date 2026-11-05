import type {
  TraceRootKind,
  TraceKind,
  TraceMatch,
  TraceFilter,
  TraceRow,
} from "./trace-types.js";
import type { ReturnRecord, ReturnSummary } from "./return-types.js";
import type {
  RecallRecord,
  RecallSummary,
  RecallBlock,
} from "./recall-types.js";
import type {
  DistributionRecord,
  DistributionSummary,
} from "./distribution-types.js";
import type {
  LoadReview,
  ReviewSummary,
  ReviewQueueItem,
} from "./review-types.js";
import type {
  SterilizationLoad,
  LoadSummary,
  PackageLoad,
} from "./cycle-types.js";
import type { SterilePackage, PackageSummary } from "./packaging-types.js";
import type { ProcessingEpisode } from "./processing-types.js";
import type { TrayDefinition, TrayAssembly } from "./tray-types.js";
import { createHash } from "node:crypto";

/** Trusted server context; never construct from caller tenant/role headers. */
export interface SterileScope {
  tenantId: string;
  facilityId: string;
  actorId: string;
}
export interface InstrumentType {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  name: string;
  manufacturer: string;
  model: string;
  createdAt: string;
  version: number;
}
export interface Instrument {
  maintenance?: import("./maintenance.js").MaintenanceEntry[];
  recall?: RecallBlock;
  processingHold?: { episodeId: string; episodeCode: string };
  activeAssembly?: { assemblyId: string; assemblyCode: string };
  id: string;
  tenantId: string;
  facilityId: string;
  ownerFacilityId: string;
  instrumentTypeId: string;
  code: string;
  serialNumber: string;
  state: "registered" | "maintenance" | "retired";
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
  retirementReason: string | null;
  version: number;
}
export interface SterileAuditEvent {
  /** Parent command for atomic multi-entity transitions; child audit IDs remain unique. */
  correlationRequestId?: string;
  id: string;
  tenantId: string;
  facilityId: string;
  actorId: string;
  at: string;
  action:
    | "maintenance-reported"
    | "maintenance-assessed"
    | "maintenance-repaired"
    | "maintenance-authorized"
    | "package-returned"
    | "return-disposition"
    | "recall-cleared-for-reprocessing"
    | "recall-reprocessing-admitted"
    | "processing-superseded"
    | "recall-expanded"
    | "recall-created"
    | "recall-recovered"
    | "recall-disposition"
    | "package-stored"
    | "package-transferred"
    | "package-issued"
    | "load-reviewed"
    | "load-created"
    | "load-contents-updated"
    | "cycle-started"
    | "cycle-recorded"
    | "load-cancelled"
    | "package-created"
    | "package-voided"
    | "inspection-recorded"
    | "processing-received"
    | "cleaning-started"
    | "cleaning-recorded"
    | "type-created"
    | "instrument-registered"
    | "instrument-retired"
    | "tray-definition-created"
    | "tray-definition-revised"
    | "tray-assembly-created"
    | "tray-assembly-updated"
    | "tray-assembly-completed"
    | "tray-assembly-disassembled";
  entityId: string;
  version: number;
  requestId: string;
  reason: string;
}
export type SterileRecord =
  | InstrumentType
  | Instrument
  | TrayDefinition
  | TrayAssembly
  | ProcessingEpisode
  | SterilePackage
  | SterilizationLoad
  | LoadReview
  | DistributionRecord
  | RecallRecord
  | ReturnRecord;
export interface CommandReceipt {
  hash: string;
  result: SterileRecord;
}
/** All methods are scoped to the transaction's tenant/facility. Writes and audit commit together. */
export interface SterileTransaction {
  searchTraceCode(code: string): Promise<TraceMatch[]>;
  traceRows(kind: TraceKind, filter: TraceFilter): Promise<TraceRow[]>;
  traceAudit(ids: string[]): Promise<SterileAuditEvent[]>;
  findReturn(id: string): Promise<ReturnRecord | null>;
  findReturnByCode(code: string): Promise<ReturnRecord | null>;
  findReturnByPackage(id: string): Promise<ReturnRecord | null>;
  listReturns(page: number): Promise<ReturnSummary[]>;
  insertReturn(item: ReturnRecord): Promise<void>;
  updateReturn(item: ReturnRecord, expected: number): Promise<void>;
  insertReturnVersion(item: ReturnRecord): Promise<void>;
  findReturnVersion(id: string, version: number): Promise<ReturnRecord | null>;

  findRecallReadmission(
    caseId: string,
    instrumentId: string,
  ): Promise<{ episodeId: string; episodeCode: string } | null>;
  listInstrumentRecallCases(instrumentId: string): Promise<RecallRecord[]>;
  listPackageRecallCases(packageId: string): Promise<RecallRecord[]>;
  insertRecallReadmissions(
    episode: ProcessingEpisode,
    pairs: { caseId: string; instrumentId: string }[],
  ): Promise<void>;
  insertRecallInstrumentBlocks(item: RecallRecord): Promise<void>;
  findInstrumentRecallBlock(id: string): Promise<RecallBlock | null>;
  findRecall(id: string): Promise<RecallRecord | null>;
  findRecallByCode(code: string): Promise<RecallRecord | null>;
  listRecalls(page: number): Promise<RecallSummary[]>;
  insertRecall(item: RecallRecord): Promise<void>;
  updateRecall(item: RecallRecord, expected: number): Promise<void>;
  insertRecallVersion(item: RecallRecord): Promise<void>;
  findRecallVersion(id: string, version: number): Promise<RecallRecord | null>;
  insertRecallBlocks(item: RecallRecord): Promise<void>;
  findRecallBlock(packageId: string): Promise<RecallBlock | null>;
  findDistribution(id: string): Promise<DistributionRecord | null>;
  findDistributionByPackage(
    packageId: string,
  ): Promise<DistributionRecord | null>;
  listDistribution(page: number): Promise<DistributionSummary[]>;
  insertDistribution(item: DistributionRecord): Promise<void>;
  updateDistribution(item: DistributionRecord, expected: number): Promise<void>;
  insertDistributionVersion(item: DistributionRecord): Promise<void>;
  findDistributionVersion(
    id: string,
    version: number,
  ): Promise<DistributionRecord | null>;
  findReview(id: string): Promise<LoadReview | null>;
  findReviewByLoad(loadId: string): Promise<LoadReview | null>;
  listReviews(page: number): Promise<ReviewSummary[]>;
  listReviewQueue(page: number): Promise<ReviewQueueItem[]>;
  insertReview(item: LoadReview): Promise<void>;
  updateReview(item: LoadReview, expected: number): Promise<void>;
  insertReviewVersion(item: LoadReview): Promise<void>;
  findReviewVersion(id: string, version: number): Promise<LoadReview | null>;
  findLoad(id: string): Promise<SterilizationLoad | null>;
  findLoadByCode(code: string): Promise<SterilizationLoad | null>;
  listLoads(page: number): Promise<LoadSummary[]>;
  insertLoad(item: SterilizationLoad): Promise<void>;
  updateLoad(item: SterilizationLoad, expected: number): Promise<void>;
  insertLoadVersion(item: SterilizationLoad): Promise<void>;
  findLoadVersion(
    id: string,
    version: number,
  ): Promise<SterilizationLoad | null>;
  findPackageLoad(packageId: string): Promise<PackageLoad | null>;
  replaceLoadAssignments(item: SterilizationLoad): Promise<void>;
  findMachineCycle(
    sterilizer: string,
    reference: string,
  ): Promise<string | null>;
  reserveMachineCycle(item: SterilizationLoad): Promise<void>;
  findPackage(id: string): Promise<SterilePackage | null>;
  findPackageByCode(code: string): Promise<SterilePackage | null>;
  listPackages(page: number): Promise<PackageSummary[]>;
  insertPackage(item: SterilePackage): Promise<void>;
  updatePackage(item: SterilePackage, expected: number): Promise<void>;
  insertPackageVersion(item: SterilePackage): Promise<void>;
  findPackageVersion(
    id: string,
    version: number,
  ): Promise<SterilePackage | null>;
  findActivePackage(
    assemblyId: string,
  ): Promise<{ packageId: string; packageCode: string } | null>;
  reservePackage(item: SterilePackage): Promise<void>;
  releasePackage(item: SterilePackage): Promise<void>;
  findLatestProcessing(instrumentId: string): Promise<ProcessingEpisode | null>;
  findProcessing(id: string): Promise<ProcessingEpisode | null>;
  findProcessingByCode(code: string): Promise<ProcessingEpisode | null>;
  listProcessing(page: number): Promise<ProcessingEpisode[]>;
  insertProcessing(item: ProcessingEpisode): Promise<void>;
  updateProcessing(item: ProcessingEpisode, expected: number): Promise<void>;
  insertProcessingVersion(item: ProcessingEpisode): Promise<void>;
  findProcessingVersion(
    id: string,
    version: number,
  ): Promise<ProcessingEpisode | null>;
  findProcessingHold(
    id: string,
  ): Promise<{ episodeId: string; episodeCode: string } | null>;
  releaseProcessing(item: ProcessingEpisode): Promise<void>;
  reserveProcessing(item: ProcessingEpisode): Promise<void>;
  findType(id: string): Promise<InstrumentType | null>;
  findTypeByCode(code: string): Promise<InstrumentType | null>;
  listTypes(page: number): Promise<InstrumentType[]>;
  insertType(value: InstrumentType): Promise<void>;
  findInstrument(id: string): Promise<Instrument | null>;
  findInstrumentByCode(code: string): Promise<Instrument | null>;
  listInstruments(page: number): Promise<Instrument[]>;
  insertInstrument(value: Instrument): Promise<void>;
  updateInstrument(value: Instrument, expectedVersion: number): Promise<void>;
  appendAudit(event: SterileAuditEvent): Promise<void>;
  listAudit(entityId: string, page: number): Promise<SterileAuditEvent[]>;
  findDefinition(id: string): Promise<TrayDefinition | null>;
  findDefinitionByCode(code: string): Promise<TrayDefinition | null>;
  listDefinitions(page: number): Promise<TrayDefinition[]>;
  insertDefinition(item: TrayDefinition): Promise<void>;
  updateDefinition(item: TrayDefinition, expected: number): Promise<void>;
  insertDefinitionRevision(item: TrayDefinition): Promise<void>;
  findDefinitionRevision(
    id: string,
    revision: number,
  ): Promise<TrayDefinition | null>;
  findAssembly(id: string): Promise<TrayAssembly | null>;
  findAssemblyByCode(code: string): Promise<TrayAssembly | null>;
  listAssemblies(page: number): Promise<TrayAssembly[]>;
  insertAssembly(item: TrayAssembly): Promise<void>;
  updateAssembly(item: TrayAssembly, expected: number): Promise<void>;
  insertAssemblyVersion(item: TrayAssembly): Promise<void>;
  findAssemblyVersion(
    id: string,
    version: number,
  ): Promise<TrayAssembly | null>;
  findActiveAssignment(
    id: string,
  ): Promise<{ assemblyId: string; assemblyCode: string } | null>;
  replaceAssignments(item: TrayAssembly): Promise<void>;
  findReceipt(requestId: string): Promise<CommandReceipt | null>;
  saveReceipt(requestId: string, receipt: CommandReceipt): Promise<void>;
}
export interface SterileRepository {
  transaction<T>(
    scope: SterileScope,
    work: (tx: SterileTransaction) => Promise<T>,
  ): Promise<T>;
}
export class SterileError extends Error {
  constructor(
    public readonly code:
      | "INVALID_REQUEST"
      | "NOT_FOUND"
      | "CONFLICT"
      | "ASSEMBLY_INCOMPLETE"
      | "INSTRUMENT_ASSIGNED"
      | "PROCESSING_HOLD"
      | "PACKAGING_BLOCKED"
      | "LOAD_BLOCKED"
      | "REVIEW_BLOCKED"
      | "DISTRIBUTION_BLOCKED"
      | "TRACE_LIMIT"
      | "RETURN_BLOCKED"
      | "CLEARANCE_BLOCKED"
      | "RECALL_LIMIT"
      | "RECALL_BLOCKED",
  ) {
    super(code);
  }
}
export const sterileCapability = Object.freeze({
  id: "sterile.core",
  name: "Sterile Processing",
  version: "0.1.0",
  category: "clinical-operations",
  status: "ACTIVE" as const,
  description: "Independent instrument and sterile-processing traceability",
  dependencies: ["core.authentication", "core.authorization"],
});
const fail = (code: SterileError["code"]): never => {
  throw new SterileError(code);
};
export function sterileUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    return fail("INVALID_REQUEST");
  return value.toLowerCase();
}
export function scopeOf(value: SterileScope): SterileScope {
  return {
    tenantId: sterileUuid(value.tenantId),
    facilityId: sterileUuid(value.facilityId),
    actorId: sterileUuid(value.actorId),
  };
}
export function field(value: unknown, max: number, required = true): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return fail("INVALID_REQUEST");
  return value.trim().normalize("NFC");
}
export function codeOf(value: unknown): string {
  const code = field(value, 100).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) return fail("INVALID_REQUEST");
  return code;
}
export function pageOf(page: number): number {
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
    return fail("INVALID_REQUEST");
  return page;
}
export abstract class SterileRegistryBase {
  constructor(protected readonly repository: SterileRepository) {}
  protected async command<T extends SterileRecord>(
    scope: SterileScope,
    requestId: string,
    kind: string,
    body: unknown,
    work: (tx: SterileTransaction, at: string) => Promise<T>,
  ): Promise<T> {
    const s = scopeOf(scope),
      key = sterileUuid(requestId);
    const hash = createHash("sha256")
      .update(JSON.stringify({ scope: s, kind, body }))
      .digest("hex");
    return this.repository.transaction(s, async (tx) => {
      const receipt = await tx.findReceipt(key);
      if (receipt) {
        if (receipt.hash !== hash) return fail("CONFLICT");
        return structuredClone(receipt.result) as T;
      }
      const result = await work(tx, new Date().toISOString());
      await tx.saveReceipt(key, { hash, result: structuredClone(result) });
      return result;
    });
  }
}
