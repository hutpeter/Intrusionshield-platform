import {
    assertTenantScopedIdentity,
    assertVersion
} from "../shared.js";

import type {
    ClinicalLocation,
    ClinicalLocationStatus,
    ClinicalLocationType
} from "./types.js";

const locationTypes:
    readonly ClinicalLocationType[] = [
        "DEPARTMENT",
        "UNIT",
        "WARD",
        "ROOM",
        "BAY",
        "AREA",
        "OTHER"
    ];

const locationStatuses:
    readonly ClinicalLocationStatus[] = [
        "ACTIVE",
        "INACTIVE"
    ];

export function createClinicalLocation(
    input: ClinicalLocation
): ClinicalLocation {
    assertTenantScopedIdentity(
        input.id,
        input.tenantId
    );

    assertVersion(input.version);

    if (!input.facilityId.trim()) {
        throw new Error(
            "facilityId is required"
        );
    }

    if (!input.code.trim()) {
        throw new Error(
            "code is required"
        );
    }

    if (!input.name.trim()) {
        throw new Error(
            "name is required"
        );
    }

    if (
        !locationTypes.includes(
            input.locationType
        )
    ) {
        throw new Error(
            "locationType is invalid"
        );
    }

    if (
        !locationStatuses.includes(
            input.status
        )
    ) {
        throw new Error(
            "status is invalid"
        );
    }

    if (
        input.parentLocationId ===
        input.id
    ) {
        throw new Error(
            "clinical location cannot be its own parent"
        );
    }

    if (
        input.parentLocationId !==
            undefined &&
        !input.parentLocationId.trim()
    ) {
        throw new Error(
            "parentLocationId cannot be empty"
        );
    }

    return Object.freeze({
        ...input,

        facilityId:
            input.facilityId.trim(),

        parentLocationId:
            input.parentLocationId
                ?.trim() ||
            undefined,

        code:
            input.code.trim(),

        name:
            input.name.trim(),

        description:
            input.description
                ?.trim() ||
            undefined,

        floor:
            input.floor
                ?.trim() ||
            undefined
    });
}
