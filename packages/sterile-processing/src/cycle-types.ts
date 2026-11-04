import type { ReviewStatus } from "./review-types.js";
export interface LoadPackage {
  assemblyCode?: string;
  trayName?: string;
  id: string;
  code: string;
  version: number;
  assemblyId: string;
  assemblyVersion: number;
  instrumentCount: number;
}
export interface SterilizationLoad {
  review?: ReviewStatus;
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  sterilizer: string;
  method: "steam" | "low_temperature" | "other";
  profile: string;
  profileVersion: string;
  packages: LoadPackage[];
  state:
    | "draft"
    | "running"
    | "awaiting_review"
    | "failed"
    | "aborted"
    | "cancelled";
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  startedAt: string | null;
  startedBy: string | null;
  finishedAt: string | null;
  finishedBy: string | null;
  cycleReference: string | null;
  outcome: "passed" | "failed" | "aborted" | null;
  cycleEvidence: string | null;
  indicatorEvidence: string | null;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}
export type LoadSummary = Pick<
  SterilizationLoad,
  | "id"
  | "tenantId"
  | "facilityId"
  | "code"
  | "sterilizer"
  | "state"
  | "version"
  | "createdAt"
> & { packageCount: number; review?: ReviewStatus };
export interface LoadInput {
  requestId: string;
  code: string;
  sterilizer: string;
  method: "steam" | "low_temperature" | "other";
  profile: string;
  profileVersion: string;
  packageIds: string[];
  confirmed: boolean;
}
export interface CycleResultInput {
  requestId: string;
  version: number;
  outcome: "passed" | "failed" | "aborted";
  cycleEvidence: string;
  indicatorEvidence: string;
  note: string;
  confirmed: boolean;
}
export interface PackageLoad {
  review?: ReviewStatus;
  loadId: string;
  loadCode: string;
  state: SterilizationLoad["state"];
}
