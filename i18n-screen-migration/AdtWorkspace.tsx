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
    const { language, locale } = useI18n();

    const tr = (
        english: string,
        spanish: string
    ): string =>
        language === "es"
            ? spanish
            : english;

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

        const labels: Record<
            string,
            readonly [string, string]
        > = {
            ACTIVE: ["Active", "Activo"],
            INACTIVE: ["Inactive", "Inactivo"],
            DISCHARGED: ["Discharged", "Dado de alta"],
            CANCELLED: ["Cancelled", "Cancelado"],
            INPATIENT: ["Inpatient", "Hospitalizado"],
            OBSERVATION: ["Observation", "Observación"],
            EMERGENCY: ["Emergency", "Emergencia"],
            DAY_CASE: ["Day case", "Caso de día"],
            PHYSICIAN_REFERRAL: [
                "Physician referral",
                "Derivación médica"
            ],
            CLINIC_REFERRAL: [
                "Clinic referral",
                "Derivación de clínica"
            ],
            TRANSFER: ["Transfer", "Traslado"],
            DIRECT: ["Direct", "Directo"],
            OTHER: ["Other", "Otro"],
            ADMISSION: ["Admission", "Admisión"],
            RELEASED: ["Released", "Liberado"],
            DISCHARGE: ["Discharge", "Alta"],
            HOME: ["Home", "Domicilio"],
            LONG_TERM_CARE: [
                "Long-term care",
                "Cuidados de larga duración"
            ],
            REHABILITATION: [
                "Rehabilitation",
                "Rehabilitación"
            ],
            HOSPICE: [
                "Hospice",
                "Cuidados paliativos"
            ],
            LEFT_AGAINST_ADVICE: [
                "Left against advice",
                "Alta contra indicación médica"
            ],
            DECEASED: ["Deceased", "Fallecido"],
            AVAILABLE: ["Available", "Disponible"],
            OCCUPIED: ["Occupied", "Ocupada"],
            RESERVED: ["Reserved", "Reservada"],
            CLEANING: ["Cleaning", "En limpieza"],
            BLOCKED: ["Blocked", "Bloqueada"],
            MAINTENANCE: ["Maintenance", "Mantenimiento"],
            OUT_OF_SERVICE: [
                "Out of service",
                "Fuera de servicio"
            ],
            DEPARTMENT: ["Department", "Departamento"],
            UNIT: ["Unit", "Unidad"],
            WARD: ["Ward", "Sala"],
            ROOM: ["Room", "Habitación"],
            BAY: ["Bay", "Área"],
            AREA: ["Area", "Área"]
        };

        const label = labels[value];

        return label
            ? tr(label[0], label[1])
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
                    tr("Admission creation returned no admission.", "La creación de la admisión no devolvió una admisión.")
                );
            }

            setAdmission(created);
            setAssignments([]);
            setSuccess(
                tr(`Admission ${created.admissionNumber} created.`, `Admisión ${created.admissionNumber} creada.`)
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
                loadStructure()
            ]);

            setSelectedBedId("");
            setNotes("");
            setSuccess(
                tr("Bed assigned successfully.", "Cama asignada correctamente.")
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
                tr(
                    `Transfer this patient to ${bedLabel(selectedBedId)}?`,
                    `¿Trasladar a este paciente a ${bedLabel(selectedBedId)}?`
                )
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
                loadStructure()
            ]);

            setSelectedBedId("");
            setNotes("");
            setSuccess(
                tr("Patient transferred successfully.", "Paciente trasladado correctamente.")
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
                tr(`Discharge admission ${admission.admissionNumber}?`, `¿Dar de alta la admisión ${admission.admissionNumber}?`)
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
                    tr("Discharge returned no admission.", "El alta no devolvió una admisión.")
                );
            }

            setAdmission(updated);

            await Promise.all([
                loadAdmission(),
                loadStructure()
            ]);

            setSuccess(
                tr(`Admission ${updated.admissionNumber} discharged.`, `Admisión ${updated.admissionNumber} dada de alta.`)
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
                    {tr("Admission / ADT", "Admisión / ADT")}
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

            {loading && (
                <div style={styles.notice}>
                    {tr(
                        "Loading admission and bed information...",
                        "Cargando información de admisión y camas..."
                    )}
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
                        {tr(
                            "No admission exists for this encounter.",
                            "No existe una admisión para este encuentro."
                        )}
                    </div>

                    <div style={styles.grid}>
                        <label style={styles.field}>
                            <span style={styles.label}>
                                {tr("Admission type", "Tipo de admisión")}
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
                                    {tr("Inpatient", "Hospitalizado")}
                                </option>
                                <option value="OBSERVATION">
                                    {tr("Observation", "Observación")}
                                </option>
                                <option value="EMERGENCY">
                                    {tr("Emergency", "Emergencia")}
                                </option>
                                <option value="DAY_CASE">
                                    {tr("Day case", "Caso de día")}
                                </option>
                            </select>
                        </label>

                        <label style={styles.field}>
                            <span style={styles.label}>
                                {tr("Admission source", "Origen de la admisión")}
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
                                    {tr("Emergency", "Emergencia")}
                                </option>
                                <option value="PHYSICIAN_REFERRAL">
                                    {tr("Physician referral", "Derivación médica")}
                                </option>
                                <option value="CLINIC_REFERRAL">
                                    {tr("Clinic referral", "Derivación de clínica")}
                                </option>
                                <option value="TRANSFER">
                                    {tr("Transfer", "Traslado")}
                                </option>
                                <option value="DIRECT">
                                    {tr("Direct", "Directo")}
                                </option>
                                <option value="OTHER">
                                    {tr("Other", "Otro")}
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
                            {tr("Reason for admission", "Motivo de la admisión")}
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
                                ? tr("Admitting...", "Admitiendo...")
                                : tr("Admit Patient", "Admitir paciente")}
                        </button>
                    </div>
                </>
            )}

            {admission && (
                <>
                    <div style={styles.grid}>
                        <div>
                            <span style={styles.label}>
                                {tr("Type", "Tipo")}
                            </span>
                            <div>
                                {displayEnum(
                                    admission.admissionType
                                )}
                            </div>
                        </div>

                        <div>
                            <span style={styles.label}>
                                {tr("Source", "Origen")}
                            </span>
                            <div>
                                {displayEnum(
                                    admission.admissionSource
                                )}
                            </div>
                        </div>

                        <div>
                            <span style={styles.label}>
                                {tr("Admitted", "Admitido")}
                            </span>
                            <div>
                                {displayDate(
                                    admission.admittedAt
                                )}
                            </div>
                        </div>

                        <div>
                            <span style={styles.label}>
                                {tr("Current placement", "Ubicación actual")}
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
                                    {tr("Discharged", "Dado de alta")}
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
                                    {tr("Disposition", "Destino al alta")}
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
                                            ? tr("Transfer to bed", "Trasladar a cama")
                                            : tr("Assign bed", "Asignar cama")}
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
                                            {tr("Select available bed", "Seleccionar cama disponible")}
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
                                        {tr("Placement notes", "Notas de ubicación")}
                                    </span>

                                    <input
                                        style={styles.input}
                                        value={notes}
                                        onChange={(event) =>
                                            setNotes(
                                                event.target.value
                                            )
                                        }
                                        placeholder={tr("Optional", "Opcional")}
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
                                        ? tr("Transfer Patient", "Trasladar paciente")
                                        : tr("Assign Bed", "Asignar cama")}
                                </button>
                            </div>

                            <div style={styles.grid}>
                                <label style={styles.field}>
                                    <span style={styles.label}>
                                        {tr("Discharge disposition", "Destino al alta")}
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
                                            {tr("Home", "Domicilio")}
                                        </option>
                                        <option value="TRANSFER">
                                            {tr("Transfer", "Traslado")}
                                        </option>
                                        <option value="LONG_TERM_CARE">
                                            {tr("Long-term care", "Cuidados de larga duración")}
                                        </option>
                                        <option value="REHABILITATION">
                                            {tr("Rehabilitation", "Rehabilitación")}
                                        </option>
                                        <option value="HOSPICE">
                                            {tr("Hospice", "Cuidados paliativos")}
                                        </option>
                                        <option value="LEFT_AGAINST_ADVICE">
                                            {tr("Left against advice", "Alta contra indicación médica")}
                                        </option>
                                        <option value="DECEASED">
                                            {tr("Deceased", "Fallecido")}
                                        </option>
                                        <option value="OTHER">
                                            {tr("Other", "Otro")}
                                        </option>
                                    </select>
                                </label>

                                <label style={styles.field}>
                                    <span style={styles.label}>
                                        {tr("Discharge notes", "Notas del alta")}
                                    </span>

                                    <input
                                        style={styles.input}
                                        value={dischargeNotes}
                                        onChange={(event) =>
                                            setDischargeNotes(
                                                event.target.value
                                            )
                                        }
                                        placeholder={tr("Optional", "Opcional")}
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
                                    {tr("Discharge Patient", "Dar de alta al paciente")}
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
                        {tr("Movement history", "Historial de movimientos")} (
                        {assignments.length})
                    </h5>

                    {assignments.length === 0 ? (
                        <div style={styles.notice}>
                            {tr(
                                "No bed movements have been recorded.",
                                "No se han registrado movimientos de cama."
                            )}
                        </div>
                    ) : (
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>
                                        {tr("Movement", "Movimiento")}
                                    </th>
                                    <th style={styles.th}>
                                        {tr("Bed / location", "Cama / ubicación")}
                                    </th>
                                    <th style={styles.th}>
                                        {tr("Assigned", "Asignada")}
                                    </th>
                                    <th style={styles.th}>
                                        {tr("Released", "Liberada")}
                                    </th>
                                    <th style={styles.th}>
                                        {tr("Release reason", "Motivo de liberación")}
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
                            {tr(
                                "This admission is closed. ADT actions are no longer available.",
                                "Esta admisión está cerrada. Las acciones de ADT ya no están disponibles."
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}