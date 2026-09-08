import type { TenantScopedEntity } from "../shared.js";

export type PersonStatus = "ACTIVE" | "INACTIVE" | "DECEASED";
export type Sex = "UNKNOWN" | "MALE" | "FEMALE" | "INTERSEX" | "OTHER";

export interface PersonIdentifier {
  readonly system: string;
  readonly value: string;
}

export interface ContactInformation {
  readonly email?: string;
  readonly phone?: string;
  readonly mobilePhone?: string;
}

export interface Address {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly provinceOrState?: string;
  readonly postalCode?: string;
  readonly country: string;
}

export interface Person extends TenantScopedEntity {
  readonly firstName: string;
  readonly middleName?: string;
  readonly lastName: string;
  readonly preferredName?: string;
  readonly dateOfBirth?: Date;
  readonly sex: Sex;
  readonly gender?: string;
  readonly identifiers: readonly PersonIdentifier[];
  readonly contactInformation?: ContactInformation;
  readonly addresses: readonly Address[];
  readonly status: PersonStatus;
}
