import type { TenantScopedEntity } from "../shared.js";

export type PatientStatus = "ACTIVE" | "INACTIVE" | "DECEASED" | "MERGED";

export interface CommunicationPreferences {
  readonly preferredLanguage?: string;
  readonly preferredContactMethod?: "EMAIL" | "PHONE" | "SMS" | "MAIL";
}

export interface Patient extends TenantScopedEntity {
  readonly personId: string;
  readonly medicalRecordNumber: string;
  readonly patientNumber: string;
  readonly status: PatientStatus;
  readonly registrationDate: Date;
  readonly deceasedDate?: Date;
  readonly communicationPreferences?: CommunicationPreferences;
  readonly emergencyContactPersonIds: readonly string[];
}
