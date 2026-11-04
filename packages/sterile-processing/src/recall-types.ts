import type { DistributionRecord } from "./distribution-types.js";
export interface RecallItem {
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
  requestId: string;
  code: string;
  sourceKind: "load" | "package";
  sourceId: string;
  sourceVersion: number;
  reason: string;
  reference: string;
  confirmed: boolean;
}
