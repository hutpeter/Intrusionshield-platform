import type { Person } from "@intrusionshield/his";

export type PersonRole =
  | "PATIENT"
  | "PRACTITIONER";

export type PersonFacilityAffiliationType =
  | "PATIENT_CARE"
  | "PRACTITIONER_ASSIGNMENT"
  | "GENERAL";

export interface PersonListQuery {
  readonly tenantId: string;
  readonly page: number;
  readonly pageSize: number;
  readonly search?: string;
  readonly status?: Person["status"];
}

export interface PersonListItem {
  readonly id: string;
  readonly firstName: string;
  readonly middleName?: string;
  readonly lastName: string;
  readonly preferredName?: string;
  readonly status: Person["status"];
  readonly roles: readonly PersonRole[];
  readonly primaryIdentifier?: string;
  readonly primaryFacilityId?: string;
  readonly primaryFacilityName?: string;
  readonly updatedAt: Date;
}

export interface PersonListResult {
  readonly items: readonly PersonListItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface PersonSummary {
  readonly totalPersons: number;
  readonly totalPatients: number;
  readonly totalPractitioners: number;
}

export interface FacilityOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly facilityType: string;
}

export interface PersonFacilityAffiliation {
  readonly id: string;
  readonly facilityId: string;
  readonly facilityCode: string;
  readonly facilityName: string;
  readonly affiliationType: PersonFacilityAffiliationType;
  readonly isPrimary: boolean;
  readonly effectiveFrom: Date;
  readonly effectiveUntil?: Date;
  readonly version: number;
}

export interface PersonFacilityAffiliationInput {
  readonly facilityId: string;
  readonly affiliationType: PersonFacilityAffiliationType;
  readonly isPrimary: boolean;
}
