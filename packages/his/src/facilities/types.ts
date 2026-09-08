import type { Address, ContactInformation } from "../persons/types.js";
import type { TenantScopedEntity } from "../shared.js";

export type FacilityStatus = "ACTIVE" | "INACTIVE";
export type FacilityType = "HOSPITAL" | "CLINIC" | "DEPARTMENT" | "UNIT" | "WARD" | "OTHER";

export interface Facility extends TenantScopedEntity {
  readonly parentFacilityId?: string;
  readonly facilityType: FacilityType;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly address?: Address;
  readonly contactInformation?: ContactInformation;
  readonly status: FacilityStatus;
}
