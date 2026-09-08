import type { TenantScopedEntity } from "../shared.js";

export type PractitionerStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type PractitionerType = "PHYSICIAN" | "NURSE" | "THERAPIST" | "TECHNICIAN" | "PHARMACIST" | "OTHER";

export interface PractitionerLicense {
  readonly jurisdiction: string;
  readonly licenseNumber: string;
  readonly issuedAt?: Date;
  readonly expiresAt?: Date;
}

export interface Practitioner extends TenantScopedEntity {
  readonly personId: string;
  readonly practitionerNumber: string;
  readonly practitionerType: PractitionerType;
  readonly status: PractitionerStatus;
  readonly licenses: readonly PractitionerLicense[];
  readonly specialties: readonly string[];
  readonly effectiveFrom: Date;
  readonly effectiveUntil?: Date;
}
