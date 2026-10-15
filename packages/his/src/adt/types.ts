import type {
  TenantScopedEntity
} from "../shared.js";

export type BedAssignmentType =
  | "ADMISSION"
  | "TRANSFER";

export type BedAssignmentStatus =
  | "ACTIVE"
  | "RELEASED";

export type BedReleaseReason =
  | "TRANSFER"
  | "DISCHARGE"
  | "CANCELLED"
  | "OTHER";

export interface BedAssignment
  extends TenantScopedEntity {
  readonly admissionId: string;
  readonly encounterId: string;
  readonly patientId: string;
  readonly facilityId: string;
  readonly bedId: string;

  readonly assignmentType:
    BedAssignmentType;

  readonly status:
    BedAssignmentStatus;

  readonly assignedAt: Date;
  readonly releasedAt?: Date;

  readonly releaseReason?:
    BedReleaseReason;

  readonly notes?: string;
}
