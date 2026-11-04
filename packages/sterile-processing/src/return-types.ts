import type { DistributionRecord } from "./distribution-types.js";
export interface ReturnRecord {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  packageId: string;
  packageCode: string;
  packageVersion: number;
  issue: DistributionRecord;
  condition: "unopened" | "opened" | "used" | "damaged";
  location: string;
  custodian: string;
  reference: string;
  note: string;
  state: "returned" | "quarantined" | "reprocessing";
  disposition: {
    action: "quarantine" | "reprocess";
    reason: string;
    reference: string;
    actorId: string;
    at: string;
  } | null;
  episodeId: string | null;
  episodeCode: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  receivedBy: string;
}
export type ReturnSummary = Omit<ReturnRecord, "issue">;
export type ReturnStatus = Pick<
  ReturnRecord,
  "id" | "code" | "state" | "episodeId" | "episodeCode"
>;
export interface ReturnInput {
  requestId: string;
  code: string;
  distributionId: string;
  distributionVersion: number;
  condition: ReturnRecord["condition"];
  location: string;
  custodian: string;
  reference: string;
  note: string;
  contentsChecked: boolean;
  confirmed: boolean;
}
export interface ReturnDispositionInput {
  requestId: string;
  version: number;
  action: "quarantine" | "reprocess";
  reason: string;
  reference: string;
  episodeCode: string;
  confirmed: boolean;
}
export const returnStatus = (r: ReturnRecord): ReturnStatus => ({
  id: r.id,
  code: r.code,
  state: r.state,
  episodeId: r.episodeId,
  episodeCode: r.episodeCode,
});
