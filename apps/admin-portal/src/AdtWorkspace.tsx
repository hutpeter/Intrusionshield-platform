import {
    useEffect,
    useMemo,
    useState
} from "react";

import type {
    CSSProperties
} from "react";

import {
    useI18n
} from "./i18n/index.js";

type AdmissionType =
    | "INPATIENT"
    | "OBSERVATION"
    | "EMERGENCY"
    | "DAY_CASE";

type AdmissionSource =
    | "EMERGENCY"
    | "PHYSICIAN_REFERRAL"
    | "CLINIC_REFERRAL"
    | "TRANSFER"
    | "DIRECT"
    | "OTHER";

type AdmissionStatus =
    | "ACTIVE"
    | "DISCHARGED"
    | "CANCELLED";

type DischargeDisposition =
    | "HOME"
    | "TRANSFER"
    | "LONG_TERM_CARE"
    | "REHABILITATION"
    | "HOSPICE"
    | "LEFT_AGAINST_ADVICE"
    | "DECEASED"
    | "OTHER";

type Admission = {
    id: string;
    patientId: string;
    encounterId: string;
    facilityId: string;
    admissionNumber: string;
    admissionType: AdmissionType;
    admissionSource: AdmissionSource;
    status: AdmissionStatus;
    admittedAt: string;
    dischargedAt?: string;
    admittingPractitionerId?: string;
    reasonForAdmission?: string;
    dischargeDisposition?: DischargeDisposition;
    dischargeNotes?: string;
    version: number;
};

type BedAssignment = {
    id: string;
    admissionId: string;
    encounterId: string;
    patientId: string;
    facilityId: string;
    bedId: string;
    assignmentType: "ADMISSION" | "TRANSFER";
    status: "ACTIVE" | "RELEASED";
    assignedAt: string;
    releasedAt?: string;
    releaseReason?:
        | "TRANSFER"
        | "DISCHARGE"
        | "CANCELLED"
        | "OTHER";
    notes?: string;
    version: number;
};

type ClinicalLocation = {
    id: string;
    facilityId: string;
    parentLocationId?: string;
    code: string;
    name: string;
    locationType:
        | "DEPARTMENT"
        | "UNIT"
        | "WARD"
        | "ROOM"
        | "BAY"
        | "AREA"
        | "OTHER";
    status: "ACTIVE" | "INACTIVE";
};

type Bed = {
    id: string;
    facilityId: string;
    locationId: string;
    code: string;
    name: string;
    bedType: string;
    status: "ACTIVE" | "INACTIVE";
    operationalStatus:
        | "AVAILABLE"
        | "OCCUPIED"
        | "RESERVED"
        | "CLEANING"
        | "BLOCKED"
        | "MAINTENANCE"
        | "OUT_OF_SERVICE";
};

type ListResponse<T> = {
    items: T[];
    total: number;
};

type EncounterSummary = {
    id: string;
    patientId: string;
    facilityId: string;
    encounterNumber: string;
    encounterType: string;
    reasonForEncounter?: string;
};

type CensusItem = {
    admissionId: string;
    admissionNumber: string;
    patientId: string;
    patientNumber: string;
    medicalRecordNumber: string;
    patientName: string;
    encounterId: string;
    facilityId: string;
    facilityName: string;
    status: AdmissionStatus;
    admittedAt: string;
    admissionType: AdmissionType;
    admissionSource: AdmissionSource;
    reasonForAdmission?: string;
    admittingPractitionerId?: string;
    bedAssignmentId?: string;
    bedId?: string;
    bedCode?: string;
    bedName?: string;
    locationId?: string;
    locationCode?: string;
    locationName?: string;
};

type Props = {
    tenantId: string;
    encounter: EncounterSummary;
};

const styles: Record<string, CSSProperties> = {
    shell: {
        marginTop: 18,
        borderTop: "1px solid #b2ccff",
        paddingTop: 18
    },
    headingRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap"
    },
    heading: {
        margin: 0,
        fontSize: 16,
        color: "#172033"
    },
    badge: {
        display: "inline-flex",
        borderRadius: 999,
        padding: "4px 9px",
        background: "#eef4ff",
        color: "#3538cd",
        fontSize: 12,
        fontWeight: 700
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
        gap: 12,
        marginTop: 14
    },
    field: {
        display: "flex",
        flexDirection: "column",
        gap: 6
    },
    label: {
        fontSize: 12,
        fontWeight: 700,
        color: "#475467"
    },
    input: {
        minHeight: 38,
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        padding: "7px 9px",
        font: "inherit",
        background: "#fff"
    },
    textarea: {
        minHeight: 70,
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        padding: 9,
        font: "inherit",
        resize: "vertical"
    },
    actionRow: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
        flexWrap: "wrap",
        marginTop: 14
    },
    primary: {
        border: 0,
        borderRadius: 8,
        background: "#175cd3",
        color: "#fff",
        padding: "9px 13px",
        fontWeight: 700,
        cursor: "pointer"
    },
    secondary: {
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        background: "#fff",
        color: "#344054",
        padding: "9px 13px",
        fontWeight: 700,
        cursor: "pointer"
    },
    danger: {
        border: "1px solid #fda29b",
        borderRadius: 8,
        background: "#fff",
        color: "#b42318",
        padding: "9px 13px",
        fontWeight: 700,
        cursor: "pointer"
    },
    notice: {
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        background: "#f8fafc",
        border: "1px solid #e4e7ec",
        color: "#475467"
    },
    error: {
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        background: "#fef3f2",
        border: "1px solid #fecdca",
        color: "#b42318"
    },
    success: {
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        background: "#ecfdf3",
        border: "1px solid #abefc6",
        color: "#067647"
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13,
        marginTop: 14
    },
    th: {
        textAlign: "left",
        padding: "8px 6px",
        borderBottom: "1px solid #e4e7ec",
        color: "#667085"
    },
    td: {
        padding: "9px 6px",
        borderBottom: "1px solid #f2f4f7",
        verticalAlign: "top"
    },
    tabs: {
        display: "flex",
        gap: 8,
        marginTop: 14,
        marginBottom: 14,
        flexWrap: "wrap"
    },
    tab: {
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        background: "#fff",
        color: "#344054",
        padding: "8px 12px",
        fontWeight: 700,
        cursor: "pointer"
    },
    tabActive: {
        border: "1px solid #84adff",
        borderRadius: 8,
        background: "#eef4ff",
        color: "#175cd3",
        padding: "8px 12px",
        fontWeight: 700,
        cursor: "pointer"
    },
    metricGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
        gap: 10,
        marginTop: 14
    },
    metric: {
        border: "1px solid #e4e7ec",
        borderRadius: 10,
        padding: 12,
        background: "#fff"
    },
    metricValue: {
        fontSize: 24,
        fontWeight: 800,
        color: "#172033",
        marginTop: 4
    },
    tableWrap: {
        width: "100%",
        overflowX: "auto"
    },
    unassigned: {
        display: "inline-flex",
        borderRadius: 999,
        padding: "3px 8px",
        background: "#fffaeb",
        color: "#b54708",
        fontSize: 12,
        fontWeight: 700
    }
};

function makeAdmissionNumber(): string {
    const stamp = new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14);

    const random =
        Math.floor(1000 + Math.random() * 9000);

    return `ADM-${stamp}-${random}`;
}

async function api<T>(
    url: string,
    tenantId: string,
    init?: RequestInit,
    allowNotFound = false
): Promise<T | null> {
    const response = await fetch(url, {
        ...init,
        headers: {
            "x-tenant-id": tenantId,
            ...(init?.body
                ? {
                      "content-type":
                          "application/json"
                  }
                : {}),
            ...init?.headers
        }
    });

    if (
        allowNotFound &&
        response.status === 404
    ) {
        return null;
    }

    const body = await response
        .json()
        .catch(() => ({})) as {
            error?: string;
        };

    if (!response.ok) {
        throw new Error(
            body.error ??
                `Request failed with HTTP ${response.status}`
        );
    }

    return body as T;
}

export function AdtWorkspace({
    tenantId,
    encounter
}: Props) {
    const { locale, t } = useI18n();

    const displayDate = (
        value?: string
    ): string => {
        if (!value) {
            return "--";
        }

        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? value
            : date.toLocaleString(locale);
    };

    const displayEnum = (
        value?: string
    ): string => {
        if (!value) {
            return "--";
        }

        const labels: Record<string, import("./i18n/index.js").TranslationKey> = {
            ACTIVE: "common.status.active",
            INACTIVE: "common.status.inactive",
            DISCHARGED: "athena.ui.discharged",
            CANCELLED: "common.status.cancelled",
            INPATIENT: "athena.enums.inpatient",
            OBSERVATION: "athena.enums.observation",
            EMERGENCY: "athena.enums.emergency",
            DAY_CASE: "athena.enums.dayCase",
            PHYSICIAN_REFERRAL: "athena.enums.physicianReferral",
            CLINIC_REFERRAL: "athena.enums.clinicReferral",
            TRANSFER: "athena.enums.transfer",
            DIRECT: "athena.enums.direct",
            OTHER: "athena.enums.other",
            ADMISSION: "athena.enums.admission",
            RELEASED: "athena.enums.released",
            DISCHARGE: "athena.enums.discharge",
            HOME: "athena.enums.home",
            LONG_TERM_CARE: "athena.enums.longTermCare",
            REHABILITATION: "athena.enums.rehabilitation",
            HOSPICE: "athena.enums.hospice",
            LEFT_AGAINST_ADVICE: "athena.enums.leftAgainstAdvice",
            DECEASED: "common.status.deceased",
            AVAILABLE: "athena.enums.available",
            OCCUPIED: "athena.enums.occupied",
            RESERVED: "athena.enums.reserved",
            CLEANING: "athena.enums.cleaning",
            BLOCKED: "athena.enums.blocked",
            MAINTENANCE: "athena.enums.maintenance",
            OUT_OF_SERVICE: "athena.enums.outOfService",
            DEPARTMENT: "athena.enums.department",
            UNIT: "athena.enums.unit",
            WARD: "athena.enums.ward",
            ROOM: "athena.enums.room",
            BAY: "athena.enums.bay",
            AREA: "athena.enums.area",
        };

        const label = labels[value];

        return label
            ? t(label)
            : value
                  .replaceAll("_", " ")
                  .toLowerCase()
                  .replace(
                      /\b\w/g,
                      (character) =>
                          character.toUpperCase()
                  );
    };
    const [
        admission,
        setAdmission
    ] = useState<Admission | null>(null);

    const [
        assignments,
        setAssignments
    ] = useState<BedAssignment[]>([]);

    const [
        locations,
        setLocations
    ] = useState<ClinicalLocation[]>([]);

    const [
        beds,
        setBeds
    ] = useState<Bed[]>([]);

    const [
        loading,
        setLoading
    ] = useState(false);

    const [
        saving,
        setSaving
    ] = useState(false);

    const [
        error,
        setError
    ] = useState<string | null>(null);

    const [
        success,
        setSuccess
    ] = useState<string | null>(null);

    const [
        view,
        setView
    ] = useState<"WORKSPACE" | "CENSUS">(
        "WORKSPACE"
    );

    const [
        census,
        setCensus
    ] = useState<CensusItem[]>([]);

    const [
        censusLoading,
        setCensusLoading
    ] = useState(false);

    const [
        censusError,
        setCensusError
    ] = useState<string | null>(null);

    const [
        admissionType,
        setAdmissionType
    ] = useState<AdmissionType>(
        encounter.encounterType === "OBSERVATION"
            ? "OBSERVATION"
            : encounter.encounterType === "EMERGENCY"
            ? "EMERGENCY"
            : encounter.encounterType === "DAY_CASE"
            ? "DAY_CASE"
            : "INPATIENT"
    );

    const [
        admissionSource,
        setAdmissionSource
    ] = useState<AdmissionSource>(
        encounter.encounterType === "EMERGENCY"
            ? "EMERGENCY"
            : "DIRECT"
    );

    const [
        reasonForAdmission,
        setReasonForAdmission
    ] = useState(
        encounter.reasonForEncounter ?? ""
    );

    const [
        selectedBedId,
        setSelectedBedId
    ] = useState("");

    const [
        notes,
        setNotes
    ] = useState("");

    const [
        dischargeDisposition,
        setDischargeDisposition
    ] = useState<DischargeDisposition>("HOME");

    const [
        dischargeNotes,
        setDischargeNotes
    ] = useState("");

    const currentAssignment =
        useMemo(
            () =>
                assignments.find(
                    (item) =>
                        item.status === "ACTIVE"
                ) ?? null,
            [assignments]
        );

    const availableBeds =
        useMemo(
            () =>
                beds.filter(
                    (bed) =>
                        bed.status === "ACTIVE" &&
                        bed.operationalStatus ===
                            "AVAILABLE"
                ),
            [beds]
        );

    const bedById =
        useMemo(
            () =>
                new Map(
                    beds.map((bed) => [
                        bed.id,
                        bed
                    ])
                ),
            [beds]
        );

    const locationById =
        useMemo(
            () =>
                new Map(
                    locations.map((location) => [
                        location.id,
                        location
                    ])
                ),
            [locations]
        );

    function locationPath(
        locationId: string
    ): string {
        const names: string[] = [];
        const visited = new Set<string>();
        let current =
            locationById.get(locationId);

        while (
            current &&
            !visited.has(current.id)
        ) {
            visited.add(current.id);
            names.unshift(current.name);

            current =
                current.parentLocationId
                    ? locationById.get(
                          current.parentLocationId
                      )
                    : undefined;
        }

        return names.join(" / ") || locationId;
    }

    function bedLabel(bedId: string): string {
        const bed = bedById.get(bedId);

        if (!bed) {
            return bedId;
        }

        return `${locationPath(
            bed.locationId
        )} / ${bed.code} - ${bed.name}`;
    }

    const bedCounts =
        useMemo(() => {
            const counts = {
                AVAILABLE: 0,
                OCCUPIED: 0,
                RESERVED: 0,
                CLEANING: 0,
                BLOCKED: 0,
                MAINTENANCE: 0,
                OUT_OF_SERVICE: 0
            };

            for (const bed of beds) {
                counts[bed.operationalStatus] += 1;
            }

            return counts;
        }, [beds]);

    const censusWithoutBed =
        useMemo(
            () =>
                census.filter(
                    (item) => !item.bedId
                ).length,
            [census]
        );

    async function loadCensus():
        Promise<void> {
        setCensusLoading(true);
        setCensusError(null);

        try {
            const result =
                await api<ListResponse<CensusItem>>(
                    `/api/v1/his/admissions?facilityId=${encodeURIComponent(
                        encounter.facilityId
                    )}&status=ACTIVE`,
                    tenantId
                );

            setCensus(result?.items ?? []);
        } catch (reason) {
            setCensusError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setCensusLoading(false);
        }
    }

    async function loadStructure():
        Promise<void> {
        const locationResult =
            await api<
                ListResponse<ClinicalLocation>
            >(
                `/api/v1/his/facilities/${encodeURIComponent(
                    encounter.facilityId
                )}/locations`,
                tenantId
            );

        const activeLocations =
            locationResult?.items ?? [];

        setLocations(activeLocations);

        const bedResults =
            await Promise.all(
                activeLocations.map(
                    async (location) => {
                        const result =
                            await api<
                                ListResponse<Bed>
                            >(
                                `/api/v1/his/locations/${encodeURIComponent(
                                    location.id
                                )}/beds`,
                                tenantId
                            );

                        return result?.items ?? [];
                    }
                )
            );

        setBeds(bedResults.flat());
    }

    async function loadAdmission():
        Promise<void> {
        const result =
            await api<Admission>(
                `/api/v1/his/encounters/${encodeURIComponent(
                    encounter.id
                )}/admission`,
                tenantId,
                undefined,
                true
            );

        setAdmission(result);

        if (!result) {
            setAssignments([]);
            return;
        }

        const history =
            await api<
                ListResponse<BedAssignment>
            >(
                `/api/v1/his/admissions/${encodeURIComponent(
                    result.id
                )}/bed-assignments`,
                tenantId
            );

        setAssignments(
            history?.items ?? []
        );
    }

    async function refresh():
        Promise<void> {
        setLoading(true);
        setError(null);

        try {
            await Promise.all([
                loadStructure(),
                loadAdmission()
            ]);
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        setAdmission(null);
        setAssignments([]);
        setSelectedBedId("");
        setNotes("");
        setSuccess(null);
        setError(null);

        void refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [encounter.id, tenantId]);

    async function createAdmission():
        Promise<void> {
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const created =
                await api<Admission>(
                    "/api/v1/his/admissions",
                    tenantId,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            patientId:
                                encounter.patientId,
                            encounterId:
                                encounter.id,
                            facilityId:
                                encounter.facilityId,
                            admissionNumber:
                                makeAdmissionNumber(),
                            admissionType,
                            admissionSource,
                            admittedAt:
                                new Date()
                                    .toISOString(),
                            reasonForAdmission:
                                reasonForAdmission
                                    .trim() ||
                                undefined
                        })
                    }
                );

            if (!created) {
                throw new Error(
                    t("athena.ui.admissionCreationReturnedNoAdmission")
                );
            }

            setAdmission(created);
            setAssignments([]);
            setSuccess(
                t("athena.adt.messages.admissionCreated", { admissionNumber: created.admissionNumber })
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setSaving(false);
        }
    }

    async function assignBed():
        Promise<void> {
        if (!admission || !selectedBedId) {
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            await api<BedAssignment>(
                `/api/v1/his/admissions/${encodeURIComponent(
                    admission.id
                )}/bed-assignments`,
                tenantId,
                {
                    method: "POST",
                    body: JSON.stringify({
                        bedId: selectedBedId,
                        assignedAt:
                            new Date()
                                .toISOString(),
                        notes:
                            notes.trim() ||
                            undefined
                    })
                }
            );

            await Promise.all([
                loadAdmission(),
                loadStructure(),
                loadCensus()
            ]);

            setSelectedBedId("");
            setNotes("");
            setSuccess(
                t("athena.ui.bedAssignedSuccessfully")
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setSaving(false);
        }
    }

    async function transfer():
        Promise<void> {
        if (!admission || !selectedBedId) {
            return;
        }

        if (
            !window.confirm(
                t("athena.adt.messages.transferConfirm", { bed: bedLabel(selectedBedId) })
            )
        ) {
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            await api<BedAssignment>(
                `/api/v1/his/admissions/${encodeURIComponent(
                    admission.id
                )}/transfers`,
                tenantId,
                {
                    method: "POST",
                    body: JSON.stringify({
                        destinationBedId:
                            selectedBedId,
                        transferredAt:
                            new Date()
                                .toISOString(),
                        notes:
                            notes.trim() ||
                            undefined
                    })
                }
            );

            await Promise.all([
                loadAdmission(),
                loadStructure(),
                loadCensus()
            ]);

            setSelectedBedId("");
            setNotes("");
            setSuccess(
                t("athena.ui.patientTransferredSuccessfully")
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setSaving(false);
        }
    }

    async function discharge():
        Promise<void> {
        if (!admission) {
            return;
        }

        if (
            !window.confirm(
                t("athena.adt.messages.dischargeConfirm", { admissionNumber: admission.admissionNumber })
            )
        ) {
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const updated =
                await api<Admission>(
                    `/api/v1/his/admissions/${encodeURIComponent(
                        admission.id
                    )}/discharge`,
                    tenantId,
                    {
                        method: "POST",
                        body: JSON.stringify({
                            version:
                                admission.version,
                            dischargedAt:
                                new Date()
                                    .toISOString(),
                            dischargeDisposition,
                            dischargeNotes:
                                dischargeNotes
                                    .trim() ||
                                undefined
                        })
                    }
                );

            if (!updated) {
                throw new Error(
                    t("athena.ui.dischargeReturnedNoAdmission")
                );
            }

            setAdmission(updated);

            await Promise.all([
                loadAdmission(),
                loadStructure(),
                loadCensus()
            ]);

            setSuccess(
                t("athena.adt.messages.admissionDischarged", { admissionNumber: updated.admissionNumber })
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setSaving(false);
        }
    }

    return (
        <div style={styles.shell}>
            <div style={styles.headingRow}>
                <h5 style={styles.heading}>
                    {t("athena.ui.admissionADT")}
                </h5>

                {admission && (
                    <span style={styles.badge}>
                        {admission.admissionNumber}
                        {" - "}
                        {displayEnum(
                            admission.status
                        )}
                    </span>
                )}
            </div>

            <div style={styles.tabs}>
                <button
                    type="button"
                    style={
                        view === "WORKSPACE"
                            ? styles.tabActive
                            : styles.tab
                    }
                    onClick={() =>
                        setView("WORKSPACE")
                    }
                >
                    Patient ADT
                </button>

                <button
                    type="button"
                    style={
                        view === "CENSUS"
                            ? styles.tabActive
                            : styles.tab
                    }
                    onClick={() => {
                        setView("CENSUS");
                        void Promise.all([
                            loadStructure(),
                            loadCensus()
                        ]);
                    }}
                >
                    Census / Bed Board
                </button>
            </div>

            {view === "CENSUS" && (
                <>
                    <div style={styles.headingRow}>
                        <div>
                            <h5 style={styles.heading}>
                                Active Census / Bed Board
                            </h5>
                            <div
                                style={{
                                    marginTop: 4,
                                    color: "#667085",
                                    fontSize: 13
                                }}
                            >
                                Facility: {encounter.facilityId}
                            </div>
                        </div>

                        <button
                            type="button"
                            style={styles.secondary}
                            disabled={censusLoading}
                            onClick={() =>
                                void Promise.all([
                                    loadStructure(),
                                    loadCensus()
                                ])
                            }
                        >
                            {censusLoading
                                ? "Refreshing..."
                                : "Refresh"}
                        </button>
                    </div>

                    {censusError && (
                        <div style={styles.error}>
                            {censusError}
                        </div>
                    )}

                    <div style={styles.metricGrid}>
                        <div style={styles.metric}>
                            <div style={styles.label}>
                                Active patients
                            </div>
                            <div style={styles.metricValue}>
                                {census.length}
                            </div>
                        </div>

                        <div style={styles.metric}>
                            <div style={styles.label}>
                                Occupied beds
                            </div>
                            <div style={styles.metricValue}>
                                {bedCounts.OCCUPIED}
                            </div>
                        </div>

                        <div style={styles.metric}>
                            <div style={styles.label}>
                                Available beds
                            </div>
                            <div style={styles.metricValue}>
                                {bedCounts.AVAILABLE}
                            </div>
                        </div>

                        <div style={styles.metric}>
                            <div style={styles.label}>
                                Awaiting bed
                            </div>
                            <div style={styles.metricValue}>
                                {censusWithoutBed}
                            </div>
                        </div>

                        <div style={styles.metric}>
                            <div style={styles.label}>
                                Cleaning
                            </div>
                            <div style={styles.metricValue}>
                                {bedCounts.CLEANING}
                            </div>
                        </div>

                        <div style={styles.metric}>
                            <div style={styles.label}>
                                Reserved / blocked
                            </div>
                            <div style={styles.metricValue}>
                                {bedCounts.RESERVED +
                                    bedCounts.BLOCKED}
                            </div>
                        </div>
                    </div>

                    {censusLoading ? (
                        <div style={styles.notice}>
                            Loading active census...
                        </div>
                    ) : census.length === 0 ? (
                        <div style={styles.notice}>
                            No active admissions were found for this facility.
                        </div>
                    ) : (
                        <div style={styles.tableWrap}>
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>
                                            Patient
                                        </th>
                                        <th style={styles.th}>
                                            Admission
                                        </th>
                                        <th style={styles.th}>
                                            Location / Bed
                                        </th>
                                        <th style={styles.th}>
                                            Type
                                        </th>
                                        <th style={styles.th}>
                                            Admitted
                                        </th>
                                        <th style={styles.th}>
                                            Status
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {census.map(
                                        (item) => (
                                            <tr
                                                key={
                                                    item.admissionId
                                                }
                                            >
                                                <td style={styles.td}>
                                                    <strong>
                                                        {
                                                            item.patientName
                                                        }
                                                    </strong>
                                                    <div>
                                                        MRN:{" "}
                                                        {
                                                            item.medicalRecordNumber
                                                        }
                                                    </div>
                                                    <div>
                                                        Patient:{" "}
                                                        {
                                                            item.patientNumber
                                                        }
                                                    </div>
                                                </td>
                                                <td style={styles.td}>
                                                    {
                                                        item.admissionNumber
                                                    }
                                                    {item.reasonForAdmission && (
                                                        <div>
                                                            {
                                                                item.reasonForAdmission
                                                            }
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={styles.td}>
                                                    {item.bedId ? (
                                                        <>
                                                            <div>
                                                                {item.locationName ??
                                                                    item.locationCode ??
                                                                    "--"}
                                                            </div>
                                                            <div>
                                                                {item.bedCode} -{" "}
                                                                {item.bedName}
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <span
                                                            style={
                                                                styles.unassigned
                                                            }
                                                        >
                                                            Awaiting bed
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={styles.td}>
                                                    {displayEnum(
                                                        item.admissionType
                                                    )}
                                                </td>
                                                <td style={styles.td}>
                                                    {displayDate(
                                                        item.admittedAt
                                                    )}
                                                </td>
                                                <td style={styles.td}>
                                                    {displayEnum(
                                                        item.status
                                                    )}
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

            {view === "WORKSPACE" && (
                <>

            {loading && (
                <div style={styles.notice}>
                    {t("athena.ui.loadingAdmissionAndBedInformation")}
                </div>
            )}

            {error && (
                <div style={styles.error}>
                    {error}
                </div>
            )}

            {success && (
                <div style={styles.success}>
                    {success}
                </div>
            )}

            {!loading && !admission && (
                <>
                    <div style={styles.notice}>
                        {t("athena.ui.noAdmissionExistsForThisEncounter")}
                    </div>

                    <div style={styles.grid}>
                        <label style={styles.field}>
                            <span style={styles.label}>
                                {t("athena.ui.admissionType")}
                            </span>

                            <select
                                style={styles.input}
                                value={admissionType}
                                onChange={(event) =>
                                    setAdmissionType(
                                        event.target
                                            .value as AdmissionType
                                    )
                                }
                            >
                                <option value="INPATIENT">
                                    {t("athena.ui.inpatient")}
                                </option>
                                <option value="OBSERVATION">
                                    {t("athena.ui.observation")}
                                </option>
                                <option value="EMERGENCY">
                                    {t("athena.ui.emergency")}
                                </option>
                                <option value="DAY_CASE">
                                    {t("athena.ui.dayCase")}
                                </option>
                            </select>
                        </label>

                        <label style={styles.field}>
                            <span style={styles.label}>
                                {t("athena.ui.admissionSource")}
                            </span>

                            <select
                                style={styles.input}
                                value={admissionSource}
                                onChange={(event) =>
                                    setAdmissionSource(
                                        event.target
                                            .value as AdmissionSource
                                    )
                                }
                            >
                                <option value="EMERGENCY">
                                    {t("athena.ui.emergency")}
                                </option>
                                <option value="PHYSICIAN_REFERRAL">
                                    {t("athena.ui.physicianReferral")}
                                </option>
                                <option value="CLINIC_REFERRAL">
                                    {t("athena.ui.clinicReferral")}
                                </option>
                                <option value="TRANSFER">
                                    {t("athena.ui.transfer")}
                                </option>
                                <option value="DIRECT">
                                    {t("athena.ui.direct")}
                                </option>
                                <option value="OTHER">
                                    {t("athena.ui.other")}
                                </option>
                            </select>
                        </label>
                    </div>

                    <label
                        style={{
                            ...styles.field,
                            marginTop: 12
                        }}
                    >
                        <span style={styles.label}>
                            {t("athena.ui.reasonForAdmission")}
                        </span>

                        <textarea
                            style={styles.textarea}
                            value={reasonForAdmission}
                            onChange={(event) =>
                                setReasonForAdmission(
                                    event.target.value
                                )
                            }
                        />
                    </label>

                    <div style={styles.actionRow}>
                        <button
                            type="button"
                            style={styles.primary}
                            disabled={saving}
                            onClick={() =>
                                void createAdmission()
                            }
                        >
                            {saving
                                ? t("athena.ui.admitting")
                                : t("athena.ui.admitPatient")}
                        </button>
                    </div>
                </>
            )}

            {admission && (
                <>
                    <div style={styles.grid}>
                        <div>
                            <span style={styles.label}>
                                {t("athena.ui.type")}
                            </span>
                            <div>
                                {displayEnum(
                                    admission.admissionType
                                )}
                            </div>
                        </div>

                        <div>
                            <span style={styles.label}>
                                {t("athena.ui.source")}
                            </span>
                            <div>
                                {displayEnum(
                                    admission.admissionSource
                                )}
                            </div>
                        </div>

                        <div>
                            <span style={styles.label}>
                                {t("athena.ui.admitted")}
                            </span>
                            <div>
                                {displayDate(
                                    admission.admittedAt
                                )}
                            </div>
                        </div>

                        <div>
                            <span style={styles.label}>
                                {t("athena.ui.currentPlacement")}
                            </span>
                            <div>
                                {currentAssignment
                                    ? bedLabel(
                                          currentAssignment.bedId
                                      )
                                    : "--"}
                            </div>
                        </div>

                        {admission.dischargedAt && (
                            <div>
                                <span style={styles.label}>
                                    {t("athena.ui.discharged")}
                                </span>
                                <div>
                                    {displayDate(
                                        admission.dischargedAt
                                    )}
                                </div>
                            </div>
                        )}

                        {admission.dischargeDisposition && (
                            <div>
                                <span style={styles.label}>
                                    {t("athena.ui.disposition")}
                                </span>
                                <div>
                                    {displayEnum(
                                        admission.dischargeDisposition
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {admission.status === "ACTIVE" && (
                        <>
                            <div style={styles.grid}>
                                <label style={styles.field}>
                                    <span style={styles.label}>
                                        {currentAssignment
                                            ? t("athena.ui.transferToBed")
                                            : t("athena.ui.assignBed")}
                                    </span>

                                    <select
                                        style={styles.input}
                                        value={selectedBedId}
                                        onChange={(event) =>
                                            setSelectedBedId(
                                                event.target.value
                                            )
                                        }
                                    >
                                        <option value="">
                                            {t("athena.ui.selectAvailableBed")}
                                        </option>

                                        {availableBeds.map(
                                            (bed) => (
                                                <option
                                                    key={bed.id}
                                                    value={bed.id}
                                                >
                                                    {bedLabel(
                                                        bed.id
                                                    )}
                                                    {" - "}
                                                    {displayEnum(
                                                        bed.bedType
                                                    )}
                                                </option>
                                            )
                                        )}
                                    </select>
                                </label>

                                <label style={styles.field}>
                                    <span style={styles.label}>
                                        {t("athena.ui.placementNotes")}
                                    </span>

                                    <input
                                        style={styles.input}
                                        value={notes}
                                        onChange={(event) =>
                                            setNotes(
                                                event.target.value
                                            )
                                        }
                                        placeholder={t("athena.ui.optional")}
                                    />
                                </label>
                            </div>

                            <div style={styles.actionRow}>
                                <button
                                    type="button"
                                    style={styles.primary}
                                    disabled={
                                        saving ||
                                        !selectedBedId
                                    }
                                    onClick={() =>
                                        currentAssignment
                                            ? void transfer()
                                            : void assignBed()
                                    }
                                >
                                    {currentAssignment
                                        ? t("athena.ui.transferPatient")
                                        : t("athena.ui.assignBedAdtWorkspace")}
                                </button>
                            </div>

                            <div style={styles.grid}>
                                <label style={styles.field}>
                                    <span style={styles.label}>
                                        {t("athena.ui.dischargeDisposition")}
                                    </span>

                                    <select
                                        style={styles.input}
                                        value={
                                            dischargeDisposition
                                        }
                                        onChange={(event) =>
                                            setDischargeDisposition(
                                                event.target
                                                    .value as DischargeDisposition
                                            )
                                        }
                                    >
                                        <option value="HOME">
                                            {t("athena.ui.home")}
                                        </option>
                                        <option value="TRANSFER">
                                            {t("athena.ui.transfer")}
                                        </option>
                                        <option value="LONG_TERM_CARE">
                                            {t("athena.ui.longTermCare")}
                                        </option>
                                        <option value="REHABILITATION">
                                            {t("athena.ui.rehabilitation")}
                                        </option>
                                        <option value="HOSPICE">
                                            {t("athena.ui.hospice")}
                                        </option>
                                        <option value="LEFT_AGAINST_ADVICE">
                                            {t("athena.ui.leftAgainstAdvice")}
                                        </option>
                                        <option value="DECEASED">
                                            {t("athena.ui.deceased")}
                                        </option>
                                        <option value="OTHER">
                                            {t("athena.ui.other")}
                                        </option>
                                    </select>
                                </label>

                                <label style={styles.field}>
                                    <span style={styles.label}>
                                        {t("athena.ui.dischargeNotes")}
                                    </span>

                                    <input
                                        style={styles.input}
                                        value={dischargeNotes}
                                        onChange={(event) =>
                                            setDischargeNotes(
                                                event.target.value
                                            )
                                        }
                                        placeholder={t("athena.ui.optional")}
                                    />
                                </label>
                            </div>

                            <div style={styles.actionRow}>
                                <button
                                    type="button"
                                    style={styles.danger}
                                    disabled={saving}
                                    onClick={() =>
                                        void discharge()
                                    }
                                >
                                    {t("athena.ui.dischargePatient")}
                                </button>
                            </div>
                        </>
                    )}

                    <h5
                        style={{
                            ...styles.heading,
                            marginTop: 18
                        }}
                    >
                        {t("athena.ui.movementHistory")} (
                        {assignments.length})
                    </h5>

                    {assignments.length === 0 ? (
                        <div style={styles.notice}>
                            {t("athena.ui.noBedMovementsHaveBeenRecorded")}
                        </div>
                    ) : (
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>
                                        {t("athena.ui.movement")}
                                    </th>
                                    <th style={styles.th}>
                                        {t("athena.ui.bedLocation")}
                                    </th>
                                    <th style={styles.th}>
                                        {t("athena.ui.assigned")}
                                    </th>
                                    <th style={styles.th}>
                                        {t("athena.ui.released")}
                                    </th>
                                    <th style={styles.th}>
                                        {t("athena.ui.releaseReason")}
                                    </th>
                                </tr>
                            </thead>

                            <tbody>
                                {assignments.map(
                                    (assignment) => (
                                        <tr
                                            key={
                                                assignment.id
                                            }
                                        >
                                            <td style={styles.td}>
                                                {displayEnum(
                                                    assignment.assignmentType
                                                )}
                                            </td>
                                            <td style={styles.td}>
                                                {bedLabel(
                                                    assignment.bedId
                                                )}
                                            </td>
                                            <td style={styles.td}>
                                                {displayDate(
                                                    assignment.assignedAt
                                                )}
                                            </td>
                                            <td style={styles.td}>
                                                {displayDate(
                                                    assignment.releasedAt
                                                )}
                                            </td>
                                            <td style={styles.td}>
                                                {displayEnum(
                                                    assignment.releaseReason
                                                )}
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    )}

                    {admission.status !== "ACTIVE" && (
                        <div style={styles.notice}>
                            {t("athena.ui.thisAdmissionIsClosedADTActionsAreNoLongerAvailable")}
                        </div>
                    )}
                </>
            )}

                </>
            )}
        </div>
    );
}
