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
  processingHold?: { episodeId: string; episodeCode: string };
  activeAssembly?: { assemblyId: string; assemblyCode: string };
  id: string;
  tenantId: string;
  facilityId: string;
  ownerFacilityId: string;
  instrumentTypeId: string;
  code: string;
  serialNumber: string;
  state: "registered" | "retired";
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
  retirementReason: string | null;
  version: number;
}
export interface SterileAuditEvent {
  id: string;
  tenantId: string;
  facilityId: string;
  actorId: string;
  at: string;
  action:
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
  | ProcessingEpisode;
export interface CommandReceipt {
  hash: string;
  result: SterileRecord;
}
/** All methods are scoped to the transaction's tenant/facility. Writes and audit commit together. */
export interface SterileTransaction {
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
      | "PROCESSING_HOLD",
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
