import type { AssemblyInstrument } from "./tray-types.js";
import type { RecallBlock } from "./recall-types.js";
import type { DistributionRecord } from "./distribution-types.js";
export interface ReturnRecord {
  scanReceipt?: { identifier: string; contents: AssemblyInstrument[] };
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
export type ReturnSummary = Omit<ReturnRecord, "issue" | "scanReceipt">;
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

export interface ScannedReturnInput extends ReturnInput {
  identifier: string;
  receivedInstrumentIds: string[];
}
export interface ReturnScanResult {
  tenantId: string;
  facilityId: string;
  identifier: string;
  issue: DistributionRecord;
  manifest: AssemblyInstrument[];
  recall: RecallBlock | null;
}
