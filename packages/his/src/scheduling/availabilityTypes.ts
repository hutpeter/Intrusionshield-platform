import type {
  TenantScopedEntity
} from "../shared.js";

export type AvailabilityResourceType =
  | "PRACTITIONER"
  | "CLINICAL_LOCATION";

export type AvailabilityExceptionType =
  | "UNAVAILABLE"
  | "AVAILABLE";

/**
 * ISO calendar date without a time zone.
 * Example: 2026-09-21
 */
export type AvailabilityDate = string;

export interface AvailabilityRule
  extends TenantScopedEntity {
  readonly resourceType:
    AvailabilityResourceType;

  readonly resourceId: string;

  /**
   * JavaScript day-of-week numbering:
   * 0 = Sunday
   * 1 = Monday
   * ...
   * 6 = Saturday
   */
  readonly dayOfWeek: number;

  /**
   * Local wall-clock time in HH:mm format.
   * The scheduling time zone is supplied when slots are requested.
   */
  readonly startTime: string;
  readonly endTime: string;

  /**
   * Calendar dates, deliberately not Date/instant values.
   */
  readonly effectiveFrom: AvailabilityDate;
  readonly effectiveTo?: AvailabilityDate;

  readonly active: boolean;
}

export interface AvailabilityException
  extends TenantScopedEntity {
  readonly resourceType:
    AvailabilityResourceType;

  readonly resourceId: string;

  /**
   * Exceptions are concrete instants.
   */
  readonly startsAt: Date;
  readonly endsAt: Date;

  readonly exceptionType:
    AvailabilityExceptionType;

  readonly reason?: string;
}

export interface AvailabilityRuleSearchCriteria {
  readonly tenantId: string;

  readonly resourceType?:
    AvailabilityResourceType;

  readonly resourceId?: string;

  readonly dayOfWeek?: number;

  readonly effectiveOn?: AvailabilityDate;

  readonly active?: boolean;
}

export interface AvailabilityExceptionSearchCriteria {
  readonly tenantId: string;

  readonly resourceType?:
    AvailabilityResourceType;

  readonly resourceId?: string;

  readonly from?: Date;
  readonly to?: Date;
}

export interface AvailabilitySlot {
  readonly start: Date;
  readonly end: Date;
}

export interface AvailabilitySlotRequest {
  readonly tenantId: string;

  readonly practitionerId?: string;
  readonly clinicalLocationId?: string;

  /**
   * Inclusive local calendar-date range.
   */
  readonly from: AvailabilityDate;
  readonly to: AvailabilityDate;

  readonly durationMinutes: number;

  /**
   * IANA time-zone identifier, for example:
   * America/Toronto
   * America/Lima
   */
  readonly timeZone: string;
}

export interface AvailabilitySlotResult {
  readonly from: AvailabilityDate;
  readonly to: AvailabilityDate;
  readonly durationMinutes: number;
  readonly timeZone: string;

  readonly practitionerId?: string;
  readonly clinicalLocationId?: string;

  readonly slots:
    readonly AvailabilitySlot[];
}
