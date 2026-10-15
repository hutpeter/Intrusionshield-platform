import type { TenantScopedEntity } from "../shared.js";

export type AdmissionType =
  | "INPATIENT"
  | "OBSERVATION"
  | "EMERGENCY"
  | "DAY_CASE";

export type AdmissionSource =
  | "EMERGENCY"
  | "PHYSICIAN_REFERRAL"
  | "CLINIC_REFERRAL"
  | "TRANSFER"
  | "DIRECT"
  | "OTHER";

export type AdmissionStatus =
  | "ACTIVE"
  | "DISCHARGED"
  | "CANCELLED";

export type DischargeDisposition =
  | "HOME"
  | "TRANSFER"
  | "LONG_TERM_CARE"
  | "REHABILITATION"
  | "HOSPICE"
  | "LEFT_AGAINST_ADVICE"
  | "DECEASED"
  | "OTHER";

export interface Admission
  extends TenantScopedEntity {
  readonly patientId: string;
  readonly encounterId: string;
  readonly facilityId: string;

  readonly admissionNumber: string;
  readonly admissionType: AdmissionType;
  readonly admissionSource: AdmissionSource;
  readonly status: AdmissionStatus;

  readonly admittedAt: Date;
  readonly dischargedAt?: Date;

  readonly admittingPractitionerId?: string;
  readonly reasonForAdmission?: string;

  readonly dischargeDisposition?:
    DischargeDisposition;

  readonly dischargeNotes?: string;
}
