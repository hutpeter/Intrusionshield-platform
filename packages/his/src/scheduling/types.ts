import type {
  TenantScopedEntity
} from "../shared.js";

export type AppointmentStatus =
  | "BOOKED"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export type AppointmentType =
  | "CONSULTATION"
  | "FOLLOW_UP"
  | "PROCEDURE"
  | "DIAGNOSTIC"
  | "THERAPY"
  | "VIRTUAL"
  | "OTHER";

export type AppointmentSource =
  | "STAFF"
  | "PATIENT_PORTAL"
  | "REFERRAL"
  | "WALK_IN"
  | "EXTERNAL"
  | "OTHER";

export interface Appointment
  extends TenantScopedEntity {
  readonly patientId: string;
  readonly facilityId: string;

  readonly practitionerId?: string;
  readonly clinicalLocationId?: string;
  readonly encounterId?: string;

  readonly appointmentNumber: string;
  readonly appointmentType: AppointmentType;
  readonly status: AppointmentStatus;
  readonly source: AppointmentSource;

  readonly scheduledStart: Date;
  readonly scheduledEnd: Date;

  readonly reason?: string;
  readonly notes?: string;

  readonly cancellationReason?: string;
  readonly cancelledAt?: Date;

  readonly checkedInAt?: Date;
  readonly completedAt?: Date;
}

export interface AppointmentSearchCriteria {
  readonly tenantId: string;

  readonly patientId?: string;
  readonly practitionerId?: string;
  readonly facilityId?: string;
  readonly clinicalLocationId?: string;

  readonly status?: AppointmentStatus;

  readonly from?: Date;
  readonly to?: Date;
}

export interface AppointmentConflictCriteria {
  readonly tenantId: string;

  readonly practitionerId?: string;
  readonly clinicalLocationId?: string;

  readonly scheduledStart: Date;
  readonly scheduledEnd: Date;

  readonly excludeAppointmentId?: string;
}
