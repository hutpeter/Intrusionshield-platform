import type { TenantScopedEntity } from "../shared.js";

export type ClinicalLocationType =
    | "DEPARTMENT"
    | "UNIT"
    | "WARD"
    | "ROOM"
    | "BAY"
    | "AREA"
    | "OTHER";

export type ClinicalLocationStatus =
    | "ACTIVE"
    | "INACTIVE";

export interface ClinicalLocation extends TenantScopedEntity {
    readonly facilityId: string;
    readonly parentLocationId?: string;
    readonly code: string;
    readonly name: string;
    readonly locationType: ClinicalLocationType;
    readonly status: ClinicalLocationStatus;
    readonly description?: string;
    readonly floor?: string;
}
