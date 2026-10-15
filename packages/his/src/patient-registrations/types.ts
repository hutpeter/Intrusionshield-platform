import type { TenantScopedEntity } from "../shared.js";

export type PatientRegistrationType =
  | "OUTPATIENT"
  | "INPATIENT"
  | "EMERGENCY"
  | "OBSERVATION"
  | "DAY_CASE";

export type PatientRegistrationStatus =
  | "REGISTERED"
  | "COMPLETED"
  | "CANCELLED";

export type PatientRegistrationSource =
  | "WALK_IN"
  | "REFERRAL"
  | "TRANSFER"
  | "SCHEDULED"
  | "EMERGENCY"
  | "OTHER";

export interface PatientRegistration extends TenantScopedEntity {
  readonly patientId: string;
  readonly facilityId: string;
  readonly registrationNumber: string;
  readonly registrationType: PatientRegistrationType;
  readonly status: PatientRegistrationStatus;
  readonly source: PatientRegistrationSource;
  readonly registeredAt: Date;
  readonly completedAt?: Date;
  readonly cancelledAt?: Date;
  readonly reasonForVisit?: string;
  readonly registrationLocation?: string;
}
