import type { TenantScopedEntity } from "../shared.js";

export type EncounterType =
  | "OUTPATIENT"
  | "INPATIENT"
  | "EMERGENCY"
  | "OBSERVATION"
  | "DAY_CASE"
  | "VIRTUAL";

export type EncounterStatus =
  | "PLANNED"
  | "ARRIVED"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "FINISHED"
  | "CANCELLED";

export type EncounterSource =
  | "REGISTRATION"
  | "SCHEDULED"
  | "WALK_IN"
  | "REFERRAL"
  | "TRANSFER"
  | "EMERGENCY"
  | "OTHER";

export interface Encounter extends TenantScopedEntity {
  readonly patientId: string;
  readonly facilityId: string;

  readonly registrationId?: string;
  readonly attendingPractitionerId?: string;

  readonly encounterNumber: string;
  readonly encounterType: EncounterType;
  readonly status: EncounterStatus;
  readonly source: EncounterSource;

  readonly startedAt: Date;
  readonly endedAt?: Date;

  readonly reasonForEncounter?: string;
  readonly referralSource?: string;
  readonly locationDescription?: string;
}
