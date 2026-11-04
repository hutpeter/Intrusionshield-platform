import type { SterilizationLoad } from "./cycle-types.js";
export interface ReviewDecision {
  number: number;
  decision: "release" | "hold" | "reject";
  reason: string;
  reference: string;
  cycleChecked: boolean;
  indicatorsChecked: boolean;
  packagesChecked: boolean;
  profileChecked: boolean;
  actorId: string;
  at: string;
  requestId: string;
}
export interface LoadReview {
  id: string;
  tenantId: string;
  facilityId: string;
  loadId: string;
  loadVersion: number;
  loadSnapshot: SterilizationLoad;
  state: "released" | "held" | "rejected";
  version: number;
  decisions: ReviewDecision[];
  createdAt: string;
  updatedAt: string;
}
export interface ReviewInput {
  requestId: string;
  loadId: string;
  loadVersion: number;
  reviewVersion: number;
  decision: "release" | "hold" | "reject";
  reason: string;
  reference: string;
  cycleChecked: boolean;
  indicatorsChecked: boolean;
  packagesChecked: boolean;
  profileChecked: boolean;
  confirmed: boolean;
}
export interface ReviewStatus {
  id: string;
  version: number;
  state: LoadReview["state"];
  decision: ReviewDecision["decision"];
  actorId: string;
  at: string;
}
export type ReviewSummary = Pick<
  LoadReview,
  | "id"
  | "tenantId"
  | "facilityId"
  | "loadId"
  | "loadVersion"
  | "state"
  | "version"
  | "createdAt"
  | "updatedAt"
> & { loadCode: string };
export interface ReviewQueueItem {
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  version: number;
  state: SterilizationLoad["state"];
  outcome: SterilizationLoad["outcome"];
  sterilizer: string;
  packageCount: number;
  reviewId: string | null;
  reviewVersion: number;
}
export function reviewStatus(record: LoadReview): ReviewStatus {
  const d = record.decisions.at(-1)!;
  return {
    id: record.id,
    version: record.version,
    state: record.state,
    decision: d.decision,
    actorId: d.actorId,
    at: d.at,
  };
}
