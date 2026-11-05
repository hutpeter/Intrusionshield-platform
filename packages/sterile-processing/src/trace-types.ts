import type { Instrument, SterileAuditEvent } from "./foundation.js";
import type { TrayAssembly, TrayDefinition } from "./tray-types.js";
import type { ProcessingEpisode } from "./processing-types.js";
import type { SterilePackage } from "./packaging-types.js";
import type { SterilizationLoad } from "./cycle-types.js";
import type { LoadReview } from "./review-types.js";
import type { DistributionRecord } from "./distribution-types.js";
import type { ReturnRecord } from "./return-types.js";
import type { RecallRecord } from "./recall-types.js";
export type TraceRootKind =
  "instrument" | "definition" | "assembly" | "package" | "load";
export type TraceKind =
  | TraceRootKind
  | "processing"
  | "review"
  | "distribution"
  | "return"
  | "recall";
export type TraceSource =
  | Instrument
  | TrayDefinition
  | TrayAssembly
  | ProcessingEpisode
  | SterilePackage
  | SterilizationLoad
  | LoadReview
  | DistributionRecord
  | ReturnRecord
  | RecallRecord;
export interface TraceRow {
  kind: TraceKind;
  current: boolean;
  record: TraceSource;
}
export interface TraceFilter {
  ids?: string[];
  instrumentIds?: string[];
  definitionIds?: string[];
  packageIds?: string[];
  loadIds?: string[];
}
export interface TraceMatch {
  kind: TraceRootKind;
  id: string;
  code: string;
  version: number;
}
export interface TraceField {
  key: string;
  value: string | number | boolean | null;
}
export interface TraceFact {
  kind: string;
  at: string | null;
  actorId: string | null;
  fields: TraceField[];
}
export interface TraceSnapshot {
  version: number;
  current: boolean;
  fields: TraceField[];
  facts: TraceFact[];
}
export interface TraceNode {
  kind: TraceKind;
  id: string;
  code: string;
  version: number;
  state: string | null;
  snapshots: TraceSnapshot[];
}
export interface TraceLink {
  fromKind: TraceKind;
  fromId: string;
  fromVersion: number;
  toKind: TraceKind;
  toId: string;
  toVersion: number | null;
  relation: string;
  targetAvailable?: boolean;
}
export interface TraceAlert {
  kind:
    | "instrument_recall"
    | "processing_hold"
    | "active_assembly"
    | "recall_block"
    | "return_block";
  entityKind: TraceKind;
  entityId: string;
  code: string;
  reference: string;
}
export interface TraceReport {
  tenantId: string;
  facilityId: string;
  generatedAt: string;
  root: TraceMatch;
  focusInstrumentIds: string[];
  nodes: TraceNode[];
  links: TraceLink[];
  events: SterileAuditEvent[];
  alerts: TraceAlert[];
  coverage: "recorded-links-only";
}
