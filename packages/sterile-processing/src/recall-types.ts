import type { DistributionRecord } from "./distribution-types.js";
export interface RecallItem {
  previousReturn?: {
    id: string;
    code: string;
    state: string;
    episodeCode: string | null;
  };
  origin?: "direct" | "reprocessed" | "current_custody";
  packageId: string;
  packageCode: string;
  packageVersion: number;
  atRecall: Pick<
    DistributionRecord,
    "id" | "version" | "state" | "location" | "destination" | "recipient"
  > | null;
  status: "outstanding" | "recovered" | "disposed";
  recovery: {
    location: string;
    reference: string;
    note: string;
    actorId: string;
    at: string;
  } | null;
  disposition: {
    action: "quarantine" | "reprocess_required" | "discard_recorded";
    reason: string;
    reference: string;
    actorId: string;
    at: string;
  } | null;
}
export interface RecallRecord {
  consumableLot?: {
    id: string;
    code: string;
    lotNumber: string;
    supplier: string;
    reference: string;
    withdrawnAt: string;
  };
  equipmentIncident?: {
    id: string;
    code: string;
    equipmentId: string;
    equipmentCode: string;
    from: string;
    to: string;
  };
  clearance?: RecallClearance;
  admissions?: RecallReadmission[];
  readmission?: {
    pendingInstrumentIds: string[];
    episodes: {
      episodeId: string;
      episodeCode: string;
      instrumentIds: string[];
    }[];
  };
  lineage?: {
    rootPackageIds: string[];
    instrumentIds: string[];
    impactHash: string;
    policy: "recorded-lineage-and-current-custody";
  };
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  sourceKind: "load" | "package";
  sourceId: string;
  sourceCode: string;
  sourceVersion: number;
  reason: string;
  reference: string;
  items: RecallItem[];
  state: "open" | "closed";
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
export type RecallSummary = Omit<RecallRecord, "items"> & {
  packageCount: number;
};
export interface RecallBlock {
  caseId: string;
  caseCode: string;
  state: RecallRecord["state"];
  count: number;
}
export interface RecallInput {
  impactHash?: string;
  requestId: string;
  code: string;
  sourceKind: "load" | "package";
  sourceId: string;
  sourceVersion: number;
  reason: string;
  reference: string;
  confirmed: boolean;
}

export interface RecallImpact {
  tenantId: string;
  facilityId: string;
  sourceKind: "load" | "package";
  sourceId: string;
  sourceCode: string;
  sourceVersion: number;
  rootPackageIds: string[];
  instruments: { id: string; code: string; version: number }[];
  items: RecallItem[];
  impactHash: string;
}
export interface RecallExtensionInput {
  requestId: string;
  version: number;
  impactHash: string;
  reason: string;
  reference: string;
  confirmed: boolean;
}

export interface RecallClearanceInput {
  requestId: string;
  version: number;
  resolution: string;
  evidence: string;
  procedure: string;
  procedureVersion: string;
  causeReviewed: boolean;
  recoveryReviewed: boolean;
  dispositionReviewed: boolean;
  reprocessingRequired: boolean;
  confirmed: boolean;
}
export interface RecallClearance {
  version: number;
  instrumentIds: string[];
  resolution: string;
  evidence: string;
  procedure: string;
  procedureVersion: string;
  causeReviewed: true;
  recoveryReviewed: true;
  dispositionReviewed: true;
  reprocessingRequired: true;
  actorId: string;
  at: string;
}
export interface RecallReadmission {
  episodeId: string;
  episodeCode: string;
  instrumentIds: string[];
  reference: string;
  location: string;
  actorId: string;
  at: string;
}
export interface RecallAdmissionInput {
  requestId: string;
  version: number;
  impactHash: string;
  episodeCode: string;
  custodian: string;
  location: string;
  condition: string;
  reference: string;
  note: string;
  contentsChecked: boolean;
  confirmed: boolean;
}
export interface RecallAdmissionPlan {
  tenantId: string;
  facilityId: string;
  caseId: string;
  caseVersion: number;
  pendingInstrumentIds: string[];
  instruments: { id: string; code: string; version: number }[];
  assemblies: {
    id: string;
    code: string;
    version: number;
    packageId: string | null;
    packageVersion: number | null;
  }[];
  episodes: { id: string; code: string; version: number; state: string }[];
  clearances: {
    caseId: string;
    caseCode: string;
    version: number;
    instrumentIds: string[];
  }[];
  blockedCases: { id: string; code: string }[];
  activeCleaning: string[];
  activeCycles: string[];
  ready: boolean;
  impactHash: string;
}
