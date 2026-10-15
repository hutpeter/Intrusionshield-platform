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
    const { language } = useI18n();

    const tr = (
        english: string,
        spanish: string
    ): string =>
        language === "es"
            ? spanish
            : english;

    const displayEnum = (
        value: string
    ): string => {
        const labels: Record<
            string,
            readonly [string, string]
        > = {
            ACTIVE: ["Active", "Activo"],
            INACTIVE: ["Inactive", "Inactivo"],
            DEPARTMENT: ["Department", "Departamento"],
            UNIT: ["Unit", "Unidad"],
            WARD: ["Ward", "Sala"],
            ROOM: ["Room", "Habitación"],
            BAY: ["Bay", "Área"],
            AREA: ["Area", "Área"],
            OTHER: ["Other", "Otro"],
            STANDARD: ["Standard", "Estándar"],
            ICU: ["ICU", "UCI"],
            CCU: ["CCU", "UCC"],
            NICU: ["NICU", "UCIN"],
            PICU: ["PICU", "UCIP"],
            MATERNITY: ["Maternity", "Maternidad"],
            ISOLATION: ["Isolation", "Aislamiento"],
            BARIATRIC: ["Bariatric", "Bariátrica"],
            PEDIATRIC: ["Pediatric", "Pediátrica"],
            OBSERVATION: ["Observation", "Observación"],
            EMERGENCY: ["Emergency", "Emergencia"],
            AVAILABLE: ["Available", "Disponible"],
            OCCUPIED: ["Occupied", "Ocupada"],
            RESERVED: ["Reserved", "Reservada"],
            CLEANING: ["Cleaning", "En limpieza"],
            BLOCKED: ["Blocked", "Bloqueada"],
            MAINTENANCE: ["Maintenance", "Mantenimiento"],
            OUT_OF_SERVICE: [
                "Out of service",
                "Fuera de servicio"
            ]
        };

        const label = labels[value];

        return label
            ? tr(label[0], label[1])
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
                tr("Location code and name are required.", "El código y el nombre de la ubicación son obligatorios.")
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
                tr("Bed code and name are required.", "El código y el nombre de la cama son obligatorios.")
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
                                    ? ` · ${tr("Floor", "Piso")} ${location.floor}`
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
                            {tr("ATHENA · HOSPITAL INFORMATION SYSTEM", "ATHENA · SISTEMA DE INFORMACIÓN HOSPITALARIA")}
                        </div>

                        <h2>
                            {tr("Hospital Structure & Bed Management", "Estructura hospitalaria y gestión de camas")}
                        </h2>

                        <p>
                            {tr("Configure clinical locations and operational bed inventory.", "Configure ubicaciones clínicas y el inventario operativo de camas.")}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="hospital-structure-close"
                        onClick={onClose}
                        aria-label={tr("Close hospital structure", "Cerrar estructura hospitalaria")}
                    >
                        ×
                    </button>
                </header>

                <div className="hospital-structure-toolbar">
                    <label>
                        <span>{tr("Facility", "Establecimiento")}</span>

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
                                    {tr("No facilities", "No hay establecimientos")}
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
                            {tr("+ Location", "+ Ubicación")}
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
                            {tr("+ Bed", "+ Cama")}
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
                                {tr("Hospital Structure", "Estructura hospitalaria")}
                            </span>

                            <span>
                                {locations.length}
                            </span>
                        </div>

                        {loading ? (
                            <div className="hospital-structure-empty">
                                {tr("Loading…", "Cargando…")}
                            </div>
                        ) : locations.length ===
                          0 ? (
                            <div className="hospital-structure-empty">
                                <strong>
                                    {tr("No clinical locations", "No hay ubicaciones clínicas")}
                                </strong>

                                <span>
                                    {tr(
                                        "Add the first department, unit, ward or room for this facility.",
                                        "Agregue el primer departamento, unidad, sala o habitación de este establecimiento."
                                    )}
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
                                    {tr("Add location", "Agregar ubicación")}
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
                                    {tr("Select a clinical location", "Seleccione una ubicación clínica")}
                                </strong>

                                <span>
                                    {tr(
                                        "Bed inventory and operational status will appear here.",
                                        "El inventario de camas y su estado operativo aparecerán aquí."
                                    )}
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
                                                ? ` · ${tr("Floor", "Piso")} ${selectedLocation.floor}`
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
                                            {tr("+ Child Location", "+ Ubicación secundaria")}
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
                                            {tr("Edit Location", "Editar ubicación")}
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
                                            {tr("Total Beds", "Total de camas")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.AVAILABLE
                                            }
                                        </strong>
                                        <span>
                                            {tr("Available", "Disponibles")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.OCCUPIED
                                            }
                                        </strong>
                                        <span>
                                            {tr("Occupied", "Ocupadas")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.RESERVED
                                            }
                                        </strong>
                                        <span>
                                            {tr("Reserved", "Reservadas")}
                                        </span>
                                    </div>

                                    <div>
                                        <strong>
                                            {
                                                bedCounts.CLEANING
                                            }
                                        </strong>
                                        <span>
                                            {tr("Cleaning", "En limpieza")}
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
                                            {tr("Unavailable", "No disponibles")}
                                        </span>
                                    </div>
                                </div>

                                <div className="hospital-structure-bed-heading">
                                    <div>
                                        <h4>
                                            {tr("Bed Inventory", "Inventario de camas")}
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
                                        {tr("+ Add Bed", "+ Agregar cama")}
                                    </button>
                                </div>

                                {loadingBeds ? (
                                    <div className="hospital-structure-empty">
                                        {tr("Loading beds…", "Cargando camas…")}
                                    </div>
                                ) : beds.length ===
                                  0 ? (
                                    <div className="hospital-structure-empty hospital-structure-empty--large">
                                        <strong>
                                            {tr("No beds configured", "No hay camas configuradas")}
                                        </strong>

                                        <span>
                                            {tr(
                                                "Add bed inventory to this location.",
                                                "Agregue inventario de camas a esta ubicación."
                                            )}
                                        </span>

                                        <button
                                            type="button"
                                            className="primary-button"
                                            onClick={
                                                openNewBed
                                            }
                                        >
                                            {tr("Add first bed", "Agregar primera cama")}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="hospital-structure-bed-table-wrap">
                                        <table className="hospital-structure-bed-table">
                                            <thead>
                                                <tr>
                                                    <th>
                                                        {tr("Bed", "Cama")}
                                                    </th>
                                                    <th>
                                                        {tr("Type", "Tipo")}
                                                    </th>
                                                    <th>
                                                        {tr("Operational Status", "Estado operativo")}
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
                                                                    {tr("Edit", "Editar")}
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
                                    {tr("Clinical Location", "Ubicación clínica")}
                                </span>

                                <h3>
                                    {editingLocation
                                        ? tr("Edit Location", "Editar ubicación")
                                        : tr("Add Location", "Agregar ubicación")}
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
                                    {tr("Code", "Código")}
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
                                    {tr("Name", "Nombre")}
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
                                    {tr("Type", "Tipo")}
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
                                    {tr("Parent", "Superior")}
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
                                        {tr("Facility root", "Raíz del establecimiento")}
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
                                    {tr("Floor", "Piso")}
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
                                    {tr("Status", "Estado")}
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
                                        {tr("Active", "Activo")}
                                    </option>
                                    <option value="INACTIVE">
                                        {tr("Inactive", "Inactivo")}
                                    </option>
                                </select>
                            </label>

                            <label className="hospital-structure-form-wide">
                                <span>
                                    {tr("Description", "Descripción")}
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
                                {tr("Cancel", "Cancelar")}
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
                                    ? tr("Saving…", "Guardando…")
                                    : tr("Save Location", "Guardar ubicación")}
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
                                    {tr("Bed Inventory", "Inventario de camas")}
                                </span>

                                <h3>
                                    {editingBed
                                        ? tr("Edit Bed", "Editar cama")
                                        : tr("Add Bed", "Agregar cama")}
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
                                    {tr("Code", "Código")}
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
                                    {tr("Name", "Nombre")}
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
                                    {tr("Bed Type", "Tipo de cama")}
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
                                    {tr("Operational Status", "Estado operativo")}
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
                                    {tr("Administrative Status", "Estado administrativo")}
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
                                        {tr("Active", "Activo")}
                                    </option>
                                    <option value="INACTIVE">
                                        {tr("Inactive", "Inactivo")}
                                    </option>
                                </select>
                            </label>

                            <label className="hospital-structure-form-wide">
                                <span>
                                    {tr("Description", "Descripción")}
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
                                {tr("Cancel", "Cancelar")}
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
                                    ? tr("Saving…", "Guardando…")
                                    : tr("Save Bed", "Guardar cama")}
                            </button>
                        </footer>
                    </section>
                </div>
            )}
        </div>
    );
}