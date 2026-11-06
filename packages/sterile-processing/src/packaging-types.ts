import type { ReturnStatus } from "./return-types.js";
import type { RecallBlock } from "./recall-types.js";
import type { DistributionStatus } from "./distribution-types.js";
import type { PackageLoad } from "./cycle-types.js";
import type { TrayAssembly } from "./tray-types.js";
import type { InspectionItem } from "./processing-types.js";
export interface InspectionProof {
  instrumentId: string;
  episodeId: string;
  episodeCode: string;
  episodeVersion: number;
  inspectionNumber: number;
  procedure: string;
  procedureVersion: string;
  evidence: string;
  at: string;
  actorId: string;
  cleaningAttempt: number;
  checks: InspectionItem;
}
export interface SterilePackage {
  scanIdentifier?: string;
  recall?: RecallBlock;
  returned?: ReturnStatus;
  distribution?: DistributionStatus;
  activeLoad?: PackageLoad;
  id: string;
  tenantId: string;
  facilityId: string;
  code: string;
  assemblyId: string;
  assemblyVersion: number;
  assemblySnapshot: TrayAssembly;
  inspectionProofs: InspectionProof[];
  material: string;
  materialLot: string;
  procedure: string;
  procedureVersion: string;
  sealChecked: boolean;
  contentsChecked: boolean;
  state: "packaged" | "voided";
  version: number;
  createdAt: string;
  updatedAt: string;
  packedBy: string;
  voidReason: string | null;
  voidedAt: string | null;
}
export type PackageSummary = Pick<
  SterilePackage,
  | "id"
  | "tenantId"
  | "facilityId"
  | "code"
  | "assemblyId"
  | "state"
  | "version"
  | "createdAt"
> & {
  scanIdentifier?: string;
  trayName: string;
  instrumentCount: number;
  activeLoad?: PackageLoad;
  distribution?: DistributionStatus;
  recall?: RecallBlock;
  returned?: ReturnStatus;
};
export interface PackageInput {
  requestId: string;
  code: string;
  assemblyId: string;
  assemblyVersion: number;
  material: string;
  materialLot: string;
  procedure: string;
  procedureVersion: string;
  sealChecked: boolean;
  contentsChecked: boolean;
  confirmed: boolean;
}
