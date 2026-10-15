import {
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";

import {
    useI18n
} from "./i18n/index.js";

type FacilityStatus =
    | "ACTIVE"
    | "INACTIVE";

type Facility = {
    id: string;
    tenantId: string;
    parentFacilityId?: string;
    facilityType: string;
    code: string;
    name: string;
    description?: string;
    status: FacilityStatus;
    version: number;
};

type ClinicalLocationType =
    | "DEPARTMENT"
    | "UNIT"
    | "WARD"
    | "ROOM"
    | "BAY"
    | "AREA"
    | "OTHER";

type ClinicalLocationStatus =
    | "ACTIVE"
    | "INACTIVE";

type ClinicalLocation = {
    id: string;
    tenantId: string;
    facilityId: string;
    parentLocationId?: string;
    code: string;
    name: string;
    locationType: ClinicalLocationType;
    status: ClinicalLocationStatus;
    description?: string;
    floor?: string;
    version: number;
};

type BedStatus =
    | "ACTIVE"
    | "INACTIVE";

type BedOperationalStatus =
    | "AVAILABLE"
    | "OCCUPIED"
    | "RESERVED"
    | "CLEANING"
    | "BLOCKED"
    | "MAINTENANCE"
    | "OUT_OF_SERVICE";

type BedType =
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

type Bed = {
    id: string;
    tenantId: string;
    facilityId: string;
    locationId: string;
    code: string;
    name: string;
    bedType: BedType;
    status: BedStatus;
    operationalStatus: BedOperationalStatus;
    description?: string;
    version: number;
};

type ListResponse<T> = {
    items: T[];
    total: number;
};

type HospitalStructurePanelProps = {
    tenantId: string;
    onClose: () => void;
};

type LocationForm = {
    code: string;
    name: string;
    locationType: ClinicalLocationType;
    status: ClinicalLocationStatus;
    parentLocationId: string;
    floor: string;
    description: string;
};

type BedForm = {
    code: string;
    name: string;
    bedType: BedType;
    status: BedStatus;
    operationalStatus: BedOperationalStatus;
    description: string;
};

const emptyLocationForm: LocationForm = {
    code: "",
    name: "",
    locationType: "DEPARTMENT",
    status: "ACTIVE",
    parentLocationId: "",
    floor: "",
    description: ""
};

const emptyBedForm: BedForm = {
    code: "",
    name: "",
    bedType: "STANDARD",
    status: "ACTIVE",
    operationalStatus: "AVAILABLE",
    description: ""
};

const locationTypes:
    ClinicalLocationType[] = [
        "DEPARTMENT",
        "UNIT",
        "WARD",
        "ROOM",
        "BAY",
        "AREA",
        "OTHER"
    ];

const bedTypes: BedType[] = [
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

const bedOperationalStatuses:
    BedOperationalStatus[] = [
        "AVAILABLE",
        "OCCUPIED",
        "RESERVED",
        "CLEANING",
        "BLOCKED",
        "MAINTENANCE",
        "OUT_OF_SERVICE"
    ];

function readable(
    value: string
): string {
    return value
        .toLowerCase()
        .split("_")
        .map(
            (part) =>
                part.charAt(0).toUpperCase() +
                part.slice(1)
        )
        .join(" ");
}

async function apiRequest<T>(
    url: string,
    tenantId: string,
    options?: RequestInit
): Promise<T> {
    const headers =
        new Headers(
            options?.headers
        );

    headers.set(
        "x-tenant-id",
        tenantId
    );

    if (options?.body) {
        headers.set(
            "Content-Type",
            "application/json"
        );
    }

    const response =
        await fetch(
            url,
            {
                ...options,
                headers
            }
        );

    if (!response.ok) {
        let message =
            `${response.status} ${response.statusText}`;

        try {
            const payload =
                await response.json() as {
                    error?: string;
                };

            if (payload.error) {
                message =
                    payload.error;
            }
        } catch {
            // Use HTTP status text.
        }

        throw new Error(message);
    }

    return await response.json() as T;
}

function statusClass(
    status: BedOperationalStatus
): string {
    return (
        "hospital-structure-status " +
        `hospital-structure-status--${status.toLowerCase()}`
    );
}

export function HospitalStructurePanel({
    tenantId,
    onClose
}: HospitalStructurePanelProps) {
    const { t } = useI18n();

    const displayEnum = (
        value: string
    ): string => {
        const labels: Record<string, import("./i18n/index.js").TranslationKey> = {
            ACTIVE: "common.status.active",
            INACTIVE: "common.status.inactive",
            DEPARTMENT: "athena.enums.department",
            UNIT: "athena.enums.unit",
            WARD: "athena.enums.ward",
            ROOM: "athena.enums.room",
            BAY: "athena.enums.bay",
            AREA: "athena.enums.area",
            OTHER: "athena.enums.other",
            STANDARD: "athena.enums.standard",
            ICU: "athena.enums.icu",
            CCU: "athena.enums.ccu",
            NICU: "athena.enums.nicu",
            PICU: "athena.enums.picu",
            MATERNITY: "athena.enums.maternity",
            ISOLATION: "athena.enums.isolation",
            BARIATRIC: "athena.enums.bariatric",
            PEDIATRIC: "athena.enums.pediatric",
            OBSERVATION: "athena.enums.observation",
            EMERGENCY: "athena.enums.emergency",
            AVAILABLE: "athena.enums.available",
            OCCUPIED: "athena.enums.occupied",
            RESERVED: "athena.enums.reserved",
            CLEANING: "athena.enums.cleaning",
            BLOCKED: "athena.enums.blocked",
            MAINTENANCE: "athena.enums.maintenance",
            OUT_OF_SERVICE: "athena.enums.outOfService",
        };

        const label = labels[value];

        return label
            ? t(label)
            : readable(value);
    };
    const [
        facilities,
        setFacilities
    ] = useState<Facility[]>([]);

    const [
        selectedFacilityId,
        setSelectedFacilityId
    ] = useState("");

    const [
        locations,
        setLocations
    ] = useState<ClinicalLocation[]>([]);

    const [
        selectedLocationId,
        setSelectedLocationId
    ] = useState("");

    const [
        beds,
        setBeds
    ] = useState<Bed[]>([]);

    const [
        loading,
        setLoading
    ] = useState(true);

    const [
        loadingBeds,
        setLoadingBeds
    ] = useState(false);

    const [
        saving,
        setSaving
    ] = useState(false);

    const [
        error,
        setError
    ] = useState("");

    const [
        locationEditorOpen,
        setLocationEditorOpen
    ] = useState(false);

    const [
        editingLocation,
        setEditingLocation
    ] = useState<ClinicalLocation | null>(
        null
    );

    const [
        locationForm,
        setLocationForm
    ] = useState<LocationForm>(
        emptyLocationForm
    );

    const [
        bedEditorOpen,
        setBedEditorOpen
    ] = useState(false);

    const [
        editingBed,
        setEditingBed
    ] = useState<Bed | null>(
        null
    );

    const [
        bedForm,
        setBedForm
    ] = useState<BedForm>(
        emptyBedForm
    );

    const selectedFacility =
        useMemo(
            () =>
                facilities.find(
                    (facility) =>
                        facility.id ===
                        selectedFacilityId
                ) ?? null,
            [
                facilities,
                selectedFacilityId
            ]
        );

    const selectedLocation =
        useMemo(
            () =>
                locations.find(
                    (location) =>
                        location.id ===
                        selectedLocationId
                ) ?? null,
            [
                locations,
                selectedLocationId
            ]
        );

    const locationChildren =
        useMemo(() => {
            const result =
                new Map<
                    string,
                    ClinicalLocation[]
                >();

            for (const location of locations) {
                const key =
                    location.parentLocationId ??
                    "__ROOT__";

                const current =
                    result.get(key) ?? [];

                current.push(location);

                result.set(
                    key,
                    current
                );
            }

            return result;
        }, [locations]);

    const bedCounts =
        useMemo(() => {
            const counts:
                Record<
                    BedOperationalStatus,
                    number
                > = {
                    AVAILABLE: 0,
                    OCCUPIED: 0,
                    RESERVED: 0,
                    CLEANING: 0,
                    BLOCKED: 0,
                    MAINTENANCE: 0,
                    OUT_OF_SERVICE: 0
                };

            for (const bed of beds) {
                counts[
                    bed.operationalStatus
                ] += 1;
            }

            return counts;
        }, [beds]);

    const loadFacilities =
        useCallback(async () => {
            setLoading(true);
            setError("");

            try {
                const result =
                    await apiRequest<
                        ListResponse<Facility>
                    >(
                        "/api/v1/his/facilities",
                        tenantId
                    );

                setFacilities(
                    result.items
                );

                setSelectedFacilityId(
                    (current) => {
                        if (
                            current &&
                            result.items.some(
                                (facility) =>
                                    facility.id ===
                                    current
                            )
                        ) {
                            return current;
                        }

                        return (
                            result.items.find(
                                (facility) =>
                                    facility.status ===
                                    "ACTIVE"
                            )?.id ??
                            result.items[0]?.id ??
                            ""
                        );
                    }
                );
            } catch (caught) {
                setError(
                    caught instanceof Error
                        ? caught.message
                        : String(caught)
                );
            } finally {
                setLoading(false);
            }
        }, [tenantId]);

    const loadLocations =
        useCallback(
            async (
                facilityId: string
            ) => {
                if (!facilityId) {
                    setLocations([]);
                    setSelectedLocationId("");
                    return;
                }

                setError("");

                try {
                    const result =
                        await apiRequest<
                            ListResponse<
                                ClinicalLocation
                            >
                        >(
                            `/api/v1/his/facilities/${facilityId}/locations`,
                            tenantId
                        );

                    setLocations(
                        result.items
                    );

                    setSelectedLocationId(
                        (current) => {
                            if (
                                current &&
                                result.items.some(
                                    (location) =>
                                        location.id ===
                                        current
                                )
                            ) {
                                return current;
                            }

                            return (
                                result.items[0]?.id ??
                                ""
                            );
                        }
                    );
                } catch (caught) {
                    setLocations([]);
                    setSelectedLocationId("");

                    setError(
                        caught instanceof Error
                            ? caught.message
                            : String(caught)
                    );
                }
            },
            [tenantId]
        );

    const loadBeds =
        useCallback(
            async (
                locationId: string
            ) => {
                if (!locationId) {
                    setBeds([]);
                    return;
                }

                setLoadingBeds(true);
                setError("");

                try {
                    const result =
                        await apiRequest<
                            ListResponse<Bed>
                        >(
                            `/api/v1/his/locations/${locationId}/beds`,
                            tenantId
                        );

                    setBeds(
                        result.items
                    );
                } catch (caught) {
                    setBeds([]);

                    setError(
                        caught instanceof Error
                            ? caught.message
                            : String(caught)
                    );
                } finally {
                    setLoadingBeds(false);
                }
            },
            [tenantId]
        );

    useEffect(() => {
        void loadFacilities();
    }, [loadFacilities]);

    useEffect(() => {
        void loadLocations(
            selectedFacilityId
        );
    }, [
        loadLocations,
        selectedFacilityId
    ]);

    useEffect(() => {
        void loadBeds(
            selectedLocationId
        );
    }, [
        loadBeds,
        selectedLocationId
    ]);

    function openNewLocation(
        parentLocationId = ""
    ) {
        setEditingLocation(null);

        setLocationForm({
            ...emptyLocationForm,
            parentLocationId
        });

        setLocationEditorOpen(true);
    }

    function openEditLocation(
        location: ClinicalLocation
    ) {
        setEditingLocation(location);

        setLocationForm({
            code: location.code,
            name: location.name,
            locationType:
                location.locationType,
            status: location.status,
            parentLocationId:
                location.parentLocationId ??
                "",
            floor:
                location.floor ?? "",
            description:
                location.description ?? ""
        });

        setLocationEditorOpen(true);
    }

    function openNewBed() {
        if (!selectedLocation) {
            return;
        }

        setEditingBed(null);
        setBedForm(emptyBedForm);
        setBedEditorOpen(true);
    }

    function openEditBed(
        bed: Bed
    ) {
        setEditingBed(bed);

        setBedForm({
            code: bed.code,
            name: bed.name,
            bedType: bed.bedType,
            status: bed.status,
            operationalStatus:
                bed.operationalStatus,
            description:
                bed.description ?? ""
        });

        setBedEditorOpen(true);
    }

    async function saveLocation() {
        if (!selectedFacilityId) {
            return;
        }

        if (
            !locationForm.code.trim() ||
            !locationForm.name.trim()
        ) {
            setError(
                t("athena.ui.locationCodeAndNameAreRequired")
            );
            return;
        }

        setSaving(true);
        setError("");

        try {
            const body = {
                facilityId:
                    selectedFacilityId,

                parentLocationId:
                    locationForm.parentLocationId ||
                    null,

                code:
                    locationForm.code.trim(),

                name:
                    locationForm.name.trim(),

                locationType:
                    locationForm.locationType,

                status:
                    locationForm.status,

                floor:
                    locationForm.floor.trim() ||
                    null,

                description:
                    locationForm.description.trim() ||
                    null,

                ...(editingLocation
                    ? {
                          version:
                              editingLocation.version
                      }
                    : {})
            };

            if (editingLocation) {
                await apiRequest<
                    ClinicalLocation
                >(
                    `/api/v1/his/locations/${editingLocation.id}`,
                    tenantId,
                    {
                        method: "PUT",
                        body:
                            JSON.stringify(
                                body
                            )
                    }
                );
            } else {
                await apiRequest<
                    ClinicalLocation
                >(
                    "/api/v1/his/locations",
                    tenantId,
                    {
                        method: "POST",
                        body:
                            JSON.stringify(
                                body
                            )
                    }
                );
            }

            setLocationEditorOpen(false);

            await loadLocations(
                selectedFacilityId
            );
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : String(caught)
            );
        } finally {
            setSaving(false);
        }
    }

    async function saveBed() {
        if (
            !selectedFacility ||
            !selectedLocation
        ) {
            return;
        }

        if (
            !bedForm.code.trim() ||
            !bedForm.name.trim()
        ) {
            setError(
                t("athena.ui.bedCodeAndNameAreRequired")
            );
            return;
        }

        setSaving(true);
        setError("");

        try {
            const body = {
                facilityId:
                    selectedFacility.id,

                locationId:
                    selectedLocation.id,

                code:
                    bedForm.code.trim(),

                name:
                    bedForm.name.trim(),

                bedType:
                    bedForm.bedType,

                status:
                    bedForm.status,

                operationalStatus:
                    bedForm.operationalStatus,

                description:
                    bedForm.description.trim() ||
                    null,

                ...(editingBed
                    ? {
                          version:
                              editingBed.version
                      }
                    : {})
            };

            if (editingBed) {
                await apiRequest<Bed>(
                    `/api/v1/his/beds/${editingBed.id}`,
                    tenantId,
                    {
                        method: "PUT",
                        body:
                            JSON.stringify(
                                body
                            )
                    }
                );
            } else {
                await apiRequest<Bed>(
                    "/api/v1/his/beds",
                    tenantId,
                    {
                        method: "POST",
                        body:
                            JSON.stringify(
                                body
                            )
                    }
                );
            }

            setBedEditorOpen(false);

            await loadBeds(
                selectedLocation.id
            );
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : String(caught)
            );
        } finally {
            setSaving(false);
        }
    }

    function renderLocationBranch(
        parentLocationId:
            string | undefined,
        depth = 0
    ): React.ReactNode {
        const key =
            parentLocationId ??
            "__ROOT__";

        const children =
            locationChildren.get(key) ??
            [];

        return children.map(
            (location) => (
                <div
                    key={location.id}
                >
                    <button
                        type="button"
                        className={
                            "hospital-structure-tree-item " +
                            (
                                selectedLocationId ===
                                location.id
                                    ? "hospital-structure-tree-item--selected"
                                    : ""
                            )
                        }
                        style={{
                            paddingLeft:
                                `${16 + depth * 18}px`
                        }}
                        onClick={() =>
                            setSelectedLocationId(
                                location.id
                            )
                        }
                    >
                        <span className="hospital-structure-tree-icon">
                            {location.locationType ===
                            "ROOM"
                                ? "□"
                                : location.locationType ===
                                  "WARD"
                                ? "▦"
                                : location.locationType ===
                                  "UNIT"
                                ? "▤"
                                : "◇"}
                        </span>

                        <span className="hospital-structure-tree-copy">
                            <strong>
                                {location.name}
                            </strong>

                            <small>
                                {displayEnum(
                                    location.locationType
                                )}
                                {location.floor
                                    ? ` · ${t("athena.ui.floor")} ${location.floor}`
                                    : ""}
                            </small>
                        </span>
                    </button>

                    {renderLocationBranch(
                        location.id,
                        depth + 1
                    )}
                </div>
            )
        );
    }

    return (
        <div className="hospital-structure-backdrop">
            <section className="hospital-structure-panel">
                <header className="hospital-structure-header">
                    <div>
                        <div className="hospital-structure-eyebrow">
                            {t("athena.ui.athenaHOSPITALINFORMATIONSYSTEMHospitalStructurePanel")}
                        </div>

                        <h2>
                            {t("athena.ui.hospitalStructureBedManagement")}
                        </h2>

                        <p>
                            {t("athena.ui.configureClinicalLocationsAndOperationalBedInventory")}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="hospital-structure-close"
                        onClick={onClose}
                        aria-label={t("athena.ui.closeHospitalStructure")}
                    >
                        ×
                    </button>
                </header>

                <div className="hospital-structure-toolbar">
                    <label>
                        <span>{t("athena.ui.facilityEstablishment")}</span>

                        <select
                            value={
                                selectedFacilityId
                            }
                            onChange={(event) =>
                                setSelectedFacilityId(
                                    event.target.value
                                )
                            }
                            disabled={
                                loading ||
                                facilities.length ===
                                    0
                            }
                        >
                            {facilities.length ===
                                0 && (
                                <option value="">
                                    {t("athena.ui.noFacilities")}
                                </option>
                            )}

                            {facilities.map(
                                (facility) => (
                                    <option
                                        key={
                                            facility.id
                                        }
                                        value={
                                            facility.id
                                        }
                                    >
                                        {
                                            facility.name
                                        }{" "}
                                        (
                                        {
                                            facility.code
                                        }
                                        )
                                    </option>
                                )
                            )}
                        </select>
                    </label>

                    <div className="hospital-structure-toolbar-actions">
                        <button
                            type="button"
                            className="secondary-button"
                            disabled={
                                !selectedFacilityId
                            }
                            onClick={() =>
                                openNewLocation()
                            }
                        >
                            {t("athena.ui.locationHospitalStructurePanel")}
                        </button>

                        <button
                            type="button"
                            className="primary-button"
                            disabled={
                                !selectedLocation
                            }
                            onClick={
                                openNewBed
                            }
                        >
                            {t("athena.ui.bed")}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="hospital-structure-error">
                        {error}
                    </div>
                )}

                <div className="hospital-structure-layout">
                    <aside className="hospital-structure-tree">
                        <div className="hospital-structure-section-title">
                            <span>
                                {t("athena.ui.hospitalStructure")}
                            </span>

                            <span>
                                {locations.length}
                            </span>
                        </div>

                        {loading ? (
                            <div className="hospital-structure-empty">
                                {t("athena.ui.loading")}
                            </div>
                        ) : locations.length ===
                          0 ? (
                            <div className="hospital-structure-empty">
                                <strong>
                                    {t("athena.ui.noClinicalLocations")}
                                </strong>

                                <span>
                                    {t("athena.ui.addTheFirstDepartmentUnitWardOrRoomForThisFacility")}
                                </span>

                                <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={
                                        !selectedFacilityId
                                    }
                                    onClick={() =>
                                        openNewLocation()
                                    }
                                >
                                    {t("athena.ui.addLocation")}
                                </button>
                            </div>
                        ) : (
                            <div className="hospital-structure-tree-list">
                                {renderLocationBranch(
                                    undefined
                                )}
                            </div>
                        )}
                    </aside>

                    <main className="hospital-structure-detail">
                        {!selectedLocation ? (
                            <div className="hospital-structure-empty hospital-structure-empty--large">
                                <strong>
                                    {t("athena.ui.selectAClinicalLocation")}
                                </strong>

                                <span>
                                    {t("athena.ui.bedInventoryAndOperationalStatusWillAppearHere")}
                                </span>
                            </div>
                        ) : (
                            <>
                                <div className="hospital-structure-location-header">
                                    <div>
                                        <div className="hospital-structure-location-meta">
                                            {displayEnum(
                                                selectedLocation.locationType
                                            )}

                                            {selectedLocation.floor
                                                ? ` · ${t("athena.ui.floor")} ${selectedLocation.floor}`
                                                : ""}

                                            {" · "}

                                            {displayEnum(
                                                selectedLocation.status
                                            )}
                                        </div>

                                        <h3>
                                            {
                                                selectedLocation.name
                                            }
                                        </h3>

                                        <p>
                                            {selectedLocation.description ||
                                                `${selectedLocation.code} · ${selectedFacility?.name ?? ""}`}
                                        </p>
                                    </div>

                                    <div className="hospital-structure-location-actions">
                                        <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() =>
                                                openNewLocation(
                                                    selectedLocation.id
                                                )
                                            }
                                        >
                                            {t("athena.ui.childLocation")}
                                        </button>

                                        <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() =>
                                                openEditLocation(
                                                    selectedLocation
                                                )
                                            }
                                        >
                                            {t("athena.ui.editLocation")}
                                        </button>
                                    </div>
                                </div>

                                <div className="hospital-structure-metrics">
                                    <div>
                                        <strong>
                                            {
                                                beds.length
                                            }
                                        </strong>
                                        <span>
                                            {t("athena.ui.totalBeds")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.AVAILABLE
                                            }
                                        </strong>
                                        <span>
                                            {t("athena.ui.available")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.OCCUPIED
                                            }
                                        </strong>
                                        <span>
                                            {t("athena.ui.occupied")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.RESERVED
                                            }
                                        </strong>
                                        <span>
                                            {t("athena.ui.reserved")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.CLEANING
                                            }
                                        </strong>
                                        <span>
                                            {t("athena.ui.cleaning")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.MAINTENANCE +
                                                bedCounts.BLOCKED +
                                                bedCounts.OUT_OF_SERVICE
                                            }
                                        </strong>
                                        <span>
                                            {t("athena.ui.unavailable")}
                                        </span>
                                    </div>
                                </div>

                                <div className="hospital-structure-bed-heading">
                                    <div>
                                        <h4>
                                            {t("athena.ui.bedInventory")}
                                        </h4>

                                        <span>
                                            {
                                                selectedLocation.name
                                            }
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        className="primary-button"
                                        onClick={
                                            openNewBed
                                        }
                                    >
                                        {t("athena.ui.addBed")}
                                    </button>
                                </div>

                                {loadingBeds ? (
                                    <div className="hospital-structure-empty">
                                        {t("athena.ui.loadingBeds")}
                                    </div>
                                ) : beds.length ===
                                  0 ? (
                                    <div className="hospital-structure-empty hospital-structure-empty--large">
                                        <strong>
                                            {t("athena.ui.noBedsConfigured")}
                                        </strong>

                                        <span>
                                            {t("athena.ui.addBedInventoryToThisLocation")}
                                        </span>

                                        <button
                                            type="button"
                                            className="primary-button"
                                            onClick={
                                                openNewBed
                                            }
                                        >
                                            {t("athena.ui.addFirstBed")}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="hospital-structure-bed-table-wrap">
                                        <table className="hospital-structure-bed-table">
                                            <thead>
                                                <tr>
                                                    <th>
                                                        {t("athena.ui.bedHospitalStructurePanel")}
                                                    </th>
                                                    <th>
                                                        {t("athena.ui.type")}
                                                    </th>
                                                    <th>
                                                        {t("athena.ui.operationalStatus")}
                                                    </th>
                                                    <th>
                                                        Administrative
                                                    </th>
                                                    <th />
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {beds.map(
                                                    (
                                                        bed
                                                    ) => (
                                                        <tr
                                                            key={
                                                                bed.id
                                                            }
                                                        >
                                                            <td>
                                                                <strong>
                                                                    {
                                                                        bed.name
                                                                    }
                                                                </strong>

                                                                <span>
                                                                    {
                                                                        bed.code
                                                                    }
                                                                </span>
                                                            </td>

                                                            <td>
                                                                {displayEnum(
                                                                    bed.bedType
                                                                )}
                                                            </td>

                                                            <td>
                                                                <span
                                                                    className={
                                                                        statusClass(
                                                                            bed.operationalStatus
                                                                        )
                                                                    }
                                                                >
                                                                    {readable(
                                                                        bed.operationalStatus
                                                                    )}
                                                                </span>
                                                            </td>

                                                            <td>
                                                                {displayEnum(
                                                                    bed.status
                                                                )}
                                                            </td>

                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    className="hospital-structure-link-button"
                                                                    onClick={() =>
                                                                        openEditBed(
                                                                            bed
                                                                        )
                                                                    }
                                                                >
                                                                    {t("athena.ui.edit")}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </main>
                </div>
            </section>

            {locationEditorOpen && (
                <div className="hospital-structure-editor-backdrop">
                    <section className="hospital-structure-editor">
                        <header>
                            <div>
                                <span>
                                    {t("athena.ui.clinicalLocation")}
                                </span>

                                <h3>
                                    {editingLocation
                                        ? t("athena.ui.editLocation")
                                        : t("athena.ui.addLocationHospitalStructurePanel")}
                                </h3>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setLocationEditorOpen(
                                        false
                                    )
                                }
                            >
                                ×
                            </button>
                        </header>

                        <div className="hospital-structure-form-grid">
                            <label>
                                <span>
                                    {t("athena.ui.code")}
                                </span>
                                <input
                                    value={
                                        locationForm.code
                                    }
                                    onChange={(event) =>
                                        setLocationForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                code:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                />
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.name")}
                                </span>
                                <input
                                    value={
                                        locationForm.name
                                    }
                                    onChange={(event) =>
                                        setLocationForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                name:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                />
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.type")}
                                </span>
                                <select
                                    value={
                                        locationForm.locationType
                                    }
                                    onChange={(event) =>
                                        setLocationForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                locationType:
                                                    event
                                                        .target
                                                        .value as ClinicalLocationType
                                            })
                                        )
                                    }
                                >
                                    {locationTypes.map(
                                        (
                                            type
                                        ) => (
                                            <option
                                                key={
                                                    type
                                                }
                                                value={
                                                    type
                                                }
                                            >
                                                {displayEnum(
                                                    type
                                                )}
                                            </option>
                                        )
                                    )}
                                </select>
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.parent")}
                                </span>
                                <select
                                    value={
                                        locationForm.parentLocationId
                                    }
                                    onChange={(event) =>
                                        setLocationForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                parentLocationId:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                >
                                    <option value="">
                                        {t("athena.ui.facilityRoot")}
                                    </option>

                                    {locations
                                        .filter(
                                            (
                                                location
                                            ) =>
                                                location.id !==
                                                editingLocation?.id
                                        )
                                        .map(
                                            (
                                                location
                                            ) => (
                                                <option
                                                    key={
                                                        location.id
                                                    }
                                                    value={
                                                        location.id
                                                    }
                                                >
                                                    {
                                                        location.name
                                                    }{" "}
                                                    (
                                                    {displayEnum(
                                                        location.locationType
                                                    )}
                                                    )
                                                </option>
                                            )
                                        )}
                                </select>
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.floor")}
                                </span>
                                <input
                                    value={
                                        locationForm.floor
                                    }
                                    onChange={(event) =>
                                        setLocationForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                floor:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                />
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.status")}
                                </span>
                                <select
                                    value={
                                        locationForm.status
                                    }
                                    onChange={(event) =>
                                        setLocationForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                status:
                                                    event
                                                        .target
                                                        .value as ClinicalLocationStatus
                                            })
                                        )
                                    }
                                >
                                    <option value="ACTIVE">
                                        {t("athena.ui.active")}
                                    </option>
                                    <option value="INACTIVE">
                                        {t("athena.ui.inactive")}
                                    </option>
                                </select>
                            </label>

                            <label className="hospital-structure-form-wide">
                                <span>
                                    {t("athena.ui.description")}
                                </span>
                                <textarea
                                    rows={3}
                                    value={
                                        locationForm.description
                                    }
                                    onChange={(event) =>
                                        setLocationForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                description:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                />
                            </label>
                        </div>

                        <footer>
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                    setLocationEditorOpen(
                                        false
                                    )
                                }
                            >
                                {t("athena.ui.cancel")}
                            </button>

                            <button
                                type="button"
                                className="primary-button"
                                disabled={saving}
                                onClick={() =>
                                    void saveLocation()
                                }
                            >
                                {saving
                                    ? t("athena.ui.saving")
                                    : t("athena.ui.saveLocation")}
                            </button>
                        </footer>
                    </section>
                </div>
            )}

            {bedEditorOpen && (
                <div className="hospital-structure-editor-backdrop">
                    <section className="hospital-structure-editor">
                        <header>
                            <div>
                                <span>
                                    {t("athena.ui.bedInventory")}
                                </span>

                                <h3>
                                    {editingBed
                                        ? t("athena.ui.editBed")
                                        : t("athena.ui.addBedHospitalStructurePanel")}
                                </h3>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setBedEditorOpen(
                                        false
                                    )
                                }
                            >
                                ×
                            </button>
                        </header>

                        <div className="hospital-structure-form-grid">
                            <label>
                                <span>
                                    {t("athena.ui.code")}
                                </span>
                                <input
                                    value={
                                        bedForm.code
                                    }
                                    onChange={(event) =>
                                        setBedForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                code:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                />
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.name")}
                                </span>
                                <input
                                    value={
                                        bedForm.name
                                    }
                                    onChange={(event) =>
                                        setBedForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                name:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                />
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.bedType")}
                                </span>
                                <select
                                    value={
                                        bedForm.bedType
                                    }
                                    onChange={(event) =>
                                        setBedForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                bedType:
                                                    event
                                                        .target
                                                        .value as BedType
                                            })
                                        )
                                    }
                                >
                                    {bedTypes.map(
                                        (type) => (
                                            <option
                                                key={
                                                    type
                                                }
                                                value={
                                                    type
                                                }
                                            >
                                                {displayEnum(
                                                    type
                                                )}
                                            </option>
                                        )
                                    )}
                                </select>
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.operationalStatus")}
                                </span>
                                <select
                                    value={
                                        bedForm.operationalStatus
                                    }
                                    onChange={(event) =>
                                        setBedForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                operationalStatus:
                                                    event
                                                        .target
                                                        .value as BedOperationalStatus
                                            })
                                        )
                                    }
                                >
                                    {bedOperationalStatuses.map(
                                        (
                                            status
                                        ) => (
                                            <option
                                                key={
                                                    status
                                                }
                                                value={
                                                    status
                                                }
                                            >
                                                {displayEnum(
                                                    status
                                                )}
                                            </option>
                                        )
                                    )}
                                </select>
                            </label>

                            <label>
                                <span>
                                    {t("athena.ui.administrativeStatus")}
                                </span>
                                <select
                                    value={
                                        bedForm.status
                                    }
                                    onChange={(event) =>
                                        setBedForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                status:
                                                    event
                                                        .target
                                                        .value as BedStatus
                                            })
                                        )
                                    }
                                >
                                    <option value="ACTIVE">
                                        {t("athena.ui.active")}
                                    </option>
                                    <option value="INACTIVE">
                                        {t("athena.ui.inactive")}
                                    </option>
                                </select>
                            </label>

                            <label className="hospital-structure-form-wide">
                                <span>
                                    {t("athena.ui.description")}
                                </span>
                                <textarea
                                    rows={3}
                                    value={
                                        bedForm.description
                                    }
                                    onChange={(event) =>
                                        setBedForm(
                                            (
                                                current
                                            ) => ({
                                                ...current,
                                                description:
                                                    event
                                                        .target
                                                        .value
                                            })
                                        )
                                    }
                                />
                            </label>
                        </div>

                        <footer>
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() =>
                                    setBedEditorOpen(
                                        false
                                    )
                                }
                            >
                                {t("athena.ui.cancel")}
                            </button>

                            <button
                                type="button"
                                className="primary-button"
                                disabled={saving}
                                onClick={() =>
                                    void saveBed()
                                }
                            >
                                {saving
                                    ? t("athena.ui.saving")
                                    : t("athena.ui.saveBed")}
                            </button>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}