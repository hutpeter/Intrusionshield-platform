export interface PackageMovement {
  number: number;
  kind: "stored" | "transferred" | "issued";
  fromLocation: string | null;
  toLocation: string | null;
  destination: string | null;
  recipient: string | null;
  reference: string;
  reason: string;
  integrityChecked: boolean;
  actorId: string;
  at: string;
  requestId: string;
}
export interface DistributionRecord {
  id: string;
  tenantId: string;
  facilityId: string;
  packageId: string;
  packageCode: string;
  packageVersion: number;
  loadId: string;
  loadCode: string;
  loadVersion: number;
  reviewId: string;
  reviewVersion: number;
  releasedAt: string;
  releasedBy: string;
  state: "stored" | "issued";
  location: string | null;
  destination: string | null;
  recipient: string | null;
  version: number;
  events: PackageMovement[];
  createdAt: string;
  updatedAt: string;
}
export interface DistributionStatus {
  id: string;
  version: number;
  state: DistributionRecord["state"];
  location: string | null;
  destination: string | null;
}
export type DistributionSummary = Omit<DistributionRecord, "events">;
export interface StoreInput {
  requestId: string;
  packageId: string;
  packageVersion: number;
  reviewId: string;
  reviewVersion: number;
  location: string;
  reference: string;
  integrityChecked: boolean;
  confirmed: boolean;
}
export interface IssueInput {
  requestId: string;
  version: number;
  destination: string;
  recipient: string;
  reference: string;
  integrityChecked: boolean;
  confirmed: boolean;
}
export function distributionStatus(r: DistributionRecord): DistributionStatus {
  return {
    id: r.id,
    version: r.version,
    state: r.state,
    location: r.location,
    destination: r.destination,
  };
}
