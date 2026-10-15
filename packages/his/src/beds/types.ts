import type { TenantScopedEntity } from "../shared.js";

export type BedStatus =
    | "ACTIVE"
    | "INACTIVE";

export type BedOperationalStatus =
    | "AVAILABLE"
    | "OCCUPIED"
    | "RESERVED"
    | "CLEANING"
    | "BLOCKED"
    | "MAINTENANCE"
    | "OUT_OF_SERVICE";

export type BedType =
    | "STANDARD"
    | "ICU"
    | "CCU"
    | "NICU"
    | "PICU"
    | "MATERNITY"
    | "ISOLATION"
    | "BARIATRIC"
    | "PEDIATRIC"
    | "OBSERVATION"
    | "EMERGENCY"
    | "OTHER";

export interface Bed extends TenantScopedEntity {
    readonly facilityId: string;
    readonly locationId: string;
    readonly code: string;
    readonly name: string;
    readonly bedType: BedType;
    readonly status: BedStatus;
    readonly operationalStatus: BedOperationalStatus;
    readonly description?: string;
}
