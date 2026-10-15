import {
    assertTenantScopedIdentity,
    assertVersion
} from "../shared.js";

import type {
    Bed,
    BedOperationalStatus,
    BedStatus,
    BedType
} from "./types.js";

const bedTypes:
    readonly BedType[] = [
        "STANDARD",
        "ICU",
        "CCU",
        "NICU",
        "PICU",
        "MATERNITY",
        "ISOLATION",
        "BARIATRIC",
        "PEDIATRIC",
        "OBSERVATION",
        "EMERGENCY",
        "OTHER"
    ];

const bedStatuses:
    readonly BedStatus[] = [
        "ACTIVE",
        "INACTIVE"
    ];

const operationalStatuses:
    readonly BedOperationalStatus[] = [
        "AVAILABLE",
        "OCCUPIED",
        "RESERVED",
        "CLEANING",
        "BLOCKED",
        "MAINTENANCE",
        "OUT_OF_SERVICE"
    ];

export function createBed(
    input: Bed
): Bed {
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

    if (!input.locationId.trim()) {
        throw new Error(
            "locationId is required"
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
        !bedTypes.includes(
            input.bedType
        )
    ) {
        throw new Error(
            "bedType is invalid"
        );
    }

    if (
        !bedStatuses.includes(
            input.status
        )
    ) {
        throw new Error(
            "status is invalid"
        );
    }

    if (
        !operationalStatuses.includes(
            input.operationalStatus
        )
    ) {
        throw new Error(
            "operationalStatus is invalid"
        );
    }

    if (
        input.status === "INACTIVE" &&
        input.operationalStatus ===
            "OCCUPIED"
    ) {
        throw new Error(
            "an inactive bed cannot be occupied"
        );
    }

    return Object.freeze({
        ...input,

        facilityId:
            input.facilityId.trim(),

        locationId:
            input.locationId.trim(),

        code:
            input.code.trim(),

        name:
            input.name.trim(),

        description:
            input.description
                ?.trim() ||
            undefined
    });
}
