import {
    useEffect,
    useMemo,
    useState
} from "react";

import type {
    CSSProperties,
    FormEvent
} from "react";

import {
    AdtWorkspace
} from "./AdtWorkspace";

type PersonListItem = {
    id: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    preferredName?: string;
    status: "ACTIVE" | "INACTIVE" | "DECEASED";
    roles?: ("PATIENT" | "PRACTITIONER")[];
    primaryIdentifier?: string;
    primaryFacilityId?: string;
    primaryFacilityName?: string;
};

type PersonListResponse = {
    items: PersonListItem[];
};

type Patient = {
    id: string;
    personId: string;
    medicalRecordNumber: string;
    patientNumber: string;
    status:
        | "ACTIVE"
        | "INACTIVE"
        | "DECEASED"
        | "MERGED";
};

type FacilityOption = {
    id: string;
    code: string;
    name: string;
    facilityType: string;
};

type RegistrationType =
    | "OUTPATIENT"
    | "INPATIENT"
    | "EMERGENCY"
    | "OBSERVATION"
    | "DAY_CASE";

type RegistrationSource =
    | "WALK_IN"
    | "REFERRAL"
    | "TRANSFER"
    | "SCHEDULED"
    | "EMERGENCY"
    | "OTHER";

type RegistrationStatus =
    | "REGISTERED"
    | "COMPLETED"
    | "CANCELLED";

type PatientRegistration = {
    id: string;
    patientId: string;
    facilityId: string;
    registrationNumber: string;
    registrationType: RegistrationType;
    status: RegistrationStatus;
    source: RegistrationSource;
    registeredAt: string;
    completedAt?: string;
    cancelledAt?: string;
    reasonForVisit?: string;
    registrationLocation?: string;
    version: number;
};

type RegistrationListResponse = {
    items: PatientRegistration[];
    total: number;
};

type EncounterType =
    | "OUTPATIENT"
    | "INPATIENT"
    | "EMERGENCY"
    | "OBSERVATION"
    | "DAY_CASE"
    | "VIRTUAL";

type EncounterStatus =
    | "PLANNED"
    | "ARRIVED"
    | "IN_PROGRESS"
    | "ON_HOLD"
    | "FINISHED"
    | "CANCELLED";

type EncounterSource =
    | "REGISTRATION"
    | "SCHEDULED"
    | "WALK_IN"
    | "REFERRAL"
    | "TRANSFER"
    | "EMERGENCY"
    | "OTHER";

type Encounter = {
    id: string;
    patientId: string;
    facilityId: string;
    registrationId?: string;
    attendingPractitionerId?: string;
    encounterNumber: string;
    encounterType: EncounterType;
    status: EncounterStatus;
    source: EncounterSource;
    startedAt: string;
    endedAt?: string;
    reasonForEncounter?: string;
    referralSource?: string;
    locationDescription?: string;
    createdAt: string;
    updatedAt: string;
    version: number;
};

type EncounterListResponse = {
    items: Encounter[];
    total: number;
};

type Props = {
    tenantId: string;
    onClose: () => void;
};

const styles: Record<string, CSSProperties> = {
    backdrop: {
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(15,23,42,.5)",
        display: "flex",
        justifyContent: "flex-end"
    },
    panel: {
        width: "min(980px, 100vw)",
        height: "100vh",
        overflowY: "auto",
        background: "#fff",
        padding: 28,
        boxShadow:
            "-12px 0 30px rgba(15,23,42,.2)"
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        gap: 20,
        marginBottom: 24
    },
    eyebrow: {
        margin: "0 0 6px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: ".08em",
        color: "#667085"
    },
    title: {
        margin: 0,
        fontSize: 28,
        color: "#172033"
    },
    close: {
        width: 38,
        height: 38,
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        background: "#fff",
        cursor: "pointer"
    },
    section: {
        border: "1px solid #e4e7ec",
        borderRadius: 12,
        padding: 18,
        marginBottom: 18
    },
    sectionTitle: {
        margin: "0 0 14px",
        fontSize: 17,
        color: "#172033"
    },
    grid: {
        display: "grid",
        gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
        gap: 14
    },
    field: {
        display: "flex",
        flexDirection: "column",
        gap: 6
    },
    label: {
        fontSize: 13,
        fontWeight: 600,
        color: "#344054"
    },
    input: {
        minHeight: 40,
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        padding: "8px 10px",
        font: "inherit"
    },
    textarea: {
        minHeight: 84,
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        padding: 10,
        font: "inherit",
        resize: "vertical"
    },
    personList: {
        display: "grid",
        gap: 8,
        marginTop: 12
    },
    personButton: {
        textAlign: "left",
        border: "1px solid #e4e7ec",
        borderRadius: 9,
        background: "#fff",
        padding: 12,
        cursor: "pointer"
    },
    selectedPerson: {
        border: "1px solid #84adff",
        background: "#f5f8ff",
        borderRadius: 10,
        padding: 14,
        marginTop: 12
    },
    actions: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 10,
        marginTop: 18,
        flexWrap: "wrap"
    },
    primary: {
        border: 0,
        borderRadius: 8,
        background: "#175cd3",
        color: "#fff",
        padding: "10px 16px",
        fontWeight: 700,
        cursor: "pointer"
    },
    secondary: {
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        background: "#fff",
        color: "#344054",
        padding: "10px 16px",
        fontWeight: 600,
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
    successAction: {
        border: "1px solid #75e0a7",
        borderRadius: 8,
        background: "#fff",
        color: "#067647",
        padding: "9px 13px",
        fontWeight: 700,
        cursor: "pointer"
    },
    encounterAction: {
        border: 0,
        borderRadius: 8,
        background: "#175cd3",
        color: "#fff",
        padding: "9px 13px",
        fontWeight: 700,
        cursor: "pointer"
    },
    warningAction: {
        border: "1px solid #fec84b",
        borderRadius: 8,
        background: "#fffaeb",
        color: "#93370d",
        padding: "9px 13px",
        fontWeight: 700,
        cursor: "pointer"
    },
    error: {
        background: "#fef3f2",
        border: "1px solid #fecdca",
        color: "#b42318",
        padding: 12,
        borderRadius: 8,
        marginBottom: 14
    },
    success: {
        background: "#ecfdf3",
        border: "1px solid #abefc6",
        color: "#067647",
        padding: 12,
        borderRadius: 8,
        marginBottom: 14
    },
    history: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 13
    },
    th: {
        textAlign: "left",
        padding: "9px 6px",
        borderBottom: "1px solid #e4e7ec",
        color: "#667085"
    },
    td: {
        padding: "10px 6px",
        borderBottom: "1px solid #f2f4f7",
        verticalAlign: "top"
    },
    rowButton: {
        border: 0,
        background: "transparent",
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        color: "#175cd3",
        font: "inherit",
        fontWeight: 700
    },
    details: {
        background: "#f8fafc",
        border: "1px solid #e4e7ec",
        borderRadius: 10,
        padding: 16,
        marginTop: 14
    },
    encounterDetails: {
        background: "#f5f8ff",
        border: "1px solid #b2ccff",
        borderRadius: 10,
        padding: 16,
        marginTop: 14
    },
    detailGrid: {
        display: "grid",
        gridTemplateColumns:
            "repeat(auto-fit,minmax(190px,1fr))",
        gap: 12
    },
    detailValue: {
        margin: "4px 0 0",
        color: "#172033",
        overflowWrap: "anywhere"
    },
    badge: {
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "4px 9px",
        background: "#eef4ff",
        color: "#3538cd",
        fontSize: 12,
        fontWeight: 700
    }
};

function nameOf(
    person: PersonListItem
): string {
    return [
        person.firstName,
        person.middleName,
        person.lastName
    ]
        .filter(Boolean)
        .join(" ");
}

function makeRegistrationNumber(): string {
    const now = new Date();

    const stamp = now
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14);

    const random =
        Math.floor(
            1000 + Math.random() * 9000
        );

    return `REG-${stamp}-${random}`;
}

function makeEncounterNumber(): string {
    const now = new Date();

    const stamp = now
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14);

    const random =
        Math.floor(
            1000 + Math.random() * 9000
        );

    return `ENC-${stamp}-${random}`;
}

function displayDate(
    value?: string
): string {
    return value
        ? new Date(value).toLocaleString("en-CA")
        : "--";
}

function displayEnum(
    value: string
): string {
    return value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(
            /\b\w/g,
            (character) =>
                character.toUpperCase()
        );
}

function registrationEncounterType(
    registrationType: RegistrationType
): EncounterType {
    return registrationType;
}

function registrationEncounterSource(
    source: RegistrationSource
): EncounterSource {
    if (source === "OTHER") {
        return "REGISTRATION";
    }

    return source;
}

async function api<T>(
    url: string,
    tenantId: string,
    init?: RequestInit
): Promise<T> {
    const response = await fetch(
        url,
        {
            ...init,
            headers: {
                "x-tenant-id":
                    tenantId,
                ...(init?.body
                    ? {
                          "content-type":
                              "application/json"
                      }
                    : {}),
                ...init?.headers
            }
        }
    );

    const body =
        await response
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

export function PatientRegistrationPanel({
    tenantId,
    onClose
}: Props) {
    const [
        search,
        setSearch
    ] = useState("");

    const [
        people,
        setPeople
    ] = useState<PersonListItem[]>([]);

    const [
        searching,
        setSearching
    ] = useState(false);

    const [
        selectedPerson,
        setSelectedPerson
    ] =
        useState<PersonListItem | null>(
            null
        );

    const [
        patient,
        setPatient
    ] =
        useState<Patient | null>(
            null
        );

    const [
        facilities,
        setFacilities
    ] =
        useState<FacilityOption[]>([]);

    const [
        history,
        setHistory
    ] =
        useState<PatientRegistration[]>(
            []
        );

    const [
        selectedRegistrationId,
        setSelectedRegistrationId
    ] =
        useState<string | null>(
            null
        );

    const [
        encounters,
        setEncounters
    ] =
        useState<Encounter[]>([]);

    const [
        selectedEncounterId,
        setSelectedEncounterId
    ] =
        useState<string | null>(
            null
        );

    const [
        facilityId,
        setFacilityId
    ] =
        useState("");

    const [
        registrationType,
        setRegistrationType
    ] =
        useState<RegistrationType>(
            "OUTPATIENT"
        );

    const [
        source,
        setSource
    ] =
        useState<RegistrationSource>(
            "WALK_IN"
        );

    const [
        registrationLocation,
        setRegistrationLocation
    ] =
        useState("");

    const [
        reasonForVisit,
        setReasonForVisit
    ] =
        useState("");

    const [
        saving,
        setSaving
    ] =
        useState(false);

    const [
        lifecycleSaving,
        setLifecycleSaving
    ] =
        useState(false);

    const [
        encounterSaving,
        setEncounterSaving
    ] =
        useState(false);

    const [
        error,
        setError
    ] =
        useState<string | null>(
            null
        );

    const [
        success,
        setSuccess
    ] =
        useState<string | null>(
            null
        );

    useEffect(() => {
        void api<FacilityOption[]>(
            "/api/v1/his/facilities/options",
            tenantId
        )
            .then(setFacilities)
            .catch(
                (reason: unknown) =>
                    setError(
                        reason instanceof Error
                            ? reason.message
                            : String(reason)
                    )
            );
    }, [tenantId]);

    useEffect(() => {
        const timer =
            window.setTimeout(
                () => {
                    setSearching(true);

                    const query =
                        new URLSearchParams({
                            page: "1",
                            pageSize: "10"
                        });

                    if (search.trim()) {
                        query.set(
                            "search",
                            search.trim()
                        );
                    }

                    void api<PersonListResponse>(
                        `/api/v1/his/persons?${query.toString()}`,
                        tenantId
                    )
                        .then(
                            (result) =>
                                setPeople(
                                    result.items.filter(
                                        (
                                            item
                                        ) =>
                                            item.roles?.includes(
                                                "PATIENT"
                                            )
                                    )
                                )
                        )
                        .catch(
                            (
                                reason:
                                    unknown
                            ) =>
                                setError(
                                    reason instanceof
                                        Error
                                        ? reason.message
                                        : String(
                                              reason
                                          )
                                )
                        )
                        .finally(
                            () =>
                                setSearching(
                                    false
                                )
                        );
                },
                250
            );

        return () =>
            window.clearTimeout(
                timer
            );
    }, [search, tenantId]);

    const selectedFacility =
        useMemo(
            () =>
                facilities.find(
                    (facility) =>
                        facility.id ===
                        facilityId
                ),
            [
                facilities,
                facilityId
            ]
        );

    const selectedRegistration =
        useMemo(
            () =>
                history.find(
                    (item) =>
                        item.id ===
                        selectedRegistrationId
                ) ?? null,
            [
                history,
                selectedRegistrationId
            ]
        );

    const selectedEncounter =
        useMemo(
            () =>
                encounters.find(
                    (item) =>
                        item.id ===
                        selectedEncounterId
                ) ?? null,
            [
                encounters,
                selectedEncounterId
            ]
        );

    const encounterForSelectedRegistration =
        useMemo(
            () => {
                if (
                    !selectedRegistration
                ) {
                    return null;
                }

                return (
                    encounters.find(
                        (encounter) =>
                            encounter.registrationId ===
                            selectedRegistration.id
                    ) ?? null
                );
            },
            [
                encounters,
                selectedRegistration
            ]
        );

    async function loadHistory(
        patientId: string
    ): Promise<
        PatientRegistration[]
    > {
        const registrations =
            await api<RegistrationListResponse>(
                `/api/v1/his/patients/${encodeURIComponent(
                    patientId
                )}/registrations`,
                tenantId
            );

        setHistory(
            registrations.items
        );

        return registrations.items;
    }

    async function loadEncounters(
        patientId: string
    ): Promise<Encounter[]> {
        const result =
            await api<EncounterListResponse>(
                `/api/v1/his/patients/${encodeURIComponent(
                    patientId
                )}/encounters`,
                tenantId
            );

        setEncounters(
            result.items
        );

        return result.items;
    }

    async function choosePerson(
        person: PersonListItem
    ): Promise<void> {
        setError(null);
        setSuccess(null);
        setSelectedPerson(person);
        setPatient(null);
        setHistory([]);
        setEncounters([]);
        setSelectedRegistrationId(
            null
        );
        setSelectedEncounterId(null);
        setFacilityId("");

        try {
            const resolved =
                await api<Patient>(
                    `/api/v1/his/patients/by-person/${encodeURIComponent(
                        person.id
                    )}`,
                    tenantId
                );

            setPatient(resolved);

            if (
                person.primaryFacilityId &&
                facilities.some(
                    (facility) =>
                        facility.id ===
                        person.primaryFacilityId
                )
            ) {
                setFacilityId(
                    person.primaryFacilityId
                );
            }

            await Promise.all([
                loadHistory(
                    resolved.id
                ),
                loadEncounters(
                    resolved.id
                )
            ]);
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        }
    }

    async function submit(
        event: FormEvent
    ): Promise<void> {
        event.preventDefault();

        if (!patient) {
            setError(
                "Select a patient before creating a registration."
            );
            return;
        }

        if (!facilityId) {
            setError(
                "Select a facility before creating a registration."
            );
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const created =
                await api<PatientRegistration>(
                    "/api/v1/his/patient-registrations",
                    tenantId,
                    {
                        method: "POST",
                        body:
                            JSON.stringify({
                                patientId:
                                    patient.id,
                                facilityId,
                                registrationNumber:
                                    makeRegistrationNumber(),
                                registrationType,
                                status:
                                    "REGISTERED",
                                source,
                                registeredAt:
                                    new Date()
                                        .toISOString(),
                                reasonForVisit:
                                    reasonForVisit
                                        .trim() ||
                                    undefined,
                                registrationLocation:
                                    registrationLocation
                                        .trim() ||
                                    undefined
                            })
                    }
                );

            await loadHistory(
                patient.id
            );

            setSelectedRegistrationId(
                created.id
            );

            setSuccess(
                `Registration ${created.registrationNumber} created successfully.`
            );

            setReasonForVisit("");
            setRegistrationLocation("");
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

    async function transitionRegistration(
        status:
            | "COMPLETED"
            | "CANCELLED"
    ): Promise<void> {
        if (
            !selectedRegistration ||
            !patient
        ) {
            return;
        }

        const verb =
            status === "COMPLETED"
                ? "complete"
                : "cancel";

        if (
            !window.confirm(
                `Are you sure you want to ${verb} registration ${selectedRegistration.registrationNumber}?`
            )
        ) {
            return;
        }

        setLifecycleSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const updated =
                await api<PatientRegistration>(
                    `/api/v1/his/patient-registrations/${encodeURIComponent(
                        selectedRegistration.id
                    )}`,
                    tenantId,
                    {
                        method: "PUT",
                        body:
                            JSON.stringify({
                                status,
                                version:
                                    selectedRegistration.version
                            })
                    }
                );

            await loadHistory(
                patient.id
            );

            setSelectedRegistrationId(
                updated.id
            );

            setSuccess(
                `Registration ${updated.registrationNumber} ${
                    status ===
                    "COMPLETED"
                        ? "completed"
                        : "cancelled"
                }.`
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setLifecycleSaving(false);
        }
    }

    async function startEncounter():
        Promise<void> {
        if (
            !patient ||
            !selectedRegistration
        ) {
            return;
        }

        if (
            selectedRegistration.status !==
            "REGISTERED"
        ) {
            setError(
                "Only an active registration can start an encounter."
            );
            return;
        }

        if (
            encounterForSelectedRegistration
        ) {
            setSelectedEncounterId(
                encounterForSelectedRegistration.id
            );

            setError(
                "An encounter already exists for this registration."
            );

            return;
        }

        setEncounterSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const created =
                await api<Encounter>(
                    "/api/v1/his/encounters",
                    tenantId,
                    {
                        method: "POST",
                        body:
                            JSON.stringify({
                                patientId:
                                    patient.id,
                                facilityId:
                                    selectedRegistration.facilityId,
                                registrationId:
                                    selectedRegistration.id,
                                encounterNumber:
                                    makeEncounterNumber(),
                                encounterType:
                                    registrationEncounterType(
                                        selectedRegistration.registrationType
                                    ),
                                status:
                                    "ARRIVED",
                                source:
                                    registrationEncounterSource(
                                        selectedRegistration.source
                                    ),
                                startedAt:
                                    new Date()
                                        .toISOString(),
                                reasonForEncounter:
                                    selectedRegistration.reasonForVisit,
                                locationDescription:
                                    selectedRegistration.registrationLocation
                            })
                    }
                );

            await loadEncounters(
                patient.id
            );

            setSelectedEncounterId(
                created.id
            );

            setSuccess(
                `Encounter ${created.encounterNumber} started from registration ${selectedRegistration.registrationNumber}.`
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setEncounterSaving(false);
        }
    }

    async function transitionEncounter(
        status: EncounterStatus
    ): Promise<void> {
        if (
            !selectedEncounter ||
            !patient
        ) {
            return;
        }

        const action =
            displayEnum(status);

        if (
            !window.confirm(
                `Change encounter ${selectedEncounter.encounterNumber} to ${action}?`
            )
        ) {
            return;
        }

        setEncounterSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const updated =
                await api<Encounter>(
                    `/api/v1/his/encounters/${encodeURIComponent(
                        selectedEncounter.id
                    )}`,
                    tenantId,
                    {
                        method: "PUT",
                        body:
                            JSON.stringify({
                                status,
                                version:
                                    selectedEncounter.version
                            })
                    }
                );

            await loadEncounters(
                patient.id
            );

            setSelectedEncounterId(
                updated.id
            );

            setSuccess(
                `Encounter ${updated.encounterNumber} is now ${displayEnum(
                    updated.status
                )}.`
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : String(reason)
            );
        } finally {
            setEncounterSaving(false);
        }
    }

    function encounterActions(
        encounter: Encounter
    ): EncounterStatus[] {
        switch (encounter.status) {
            case "PLANNED":
                return [
                    "ARRIVED",
                    "CANCELLED"
                ];

            case "ARRIVED":
                return [
                    "IN_PROGRESS",
                    "CANCELLED"
                ];

            case "IN_PROGRESS":
                return [
                    "ON_HOLD",
                    "FINISHED"
                ];

            case "ON_HOLD":
                return [
                    "IN_PROGRESS",
                    "FINISHED",
                    "CANCELLED"
                ];

            default:
                return [];
        }
    }

    return (
        <div
            style={styles.backdrop}
            onMouseDown={(event) =>
                event.target ===
                    event.currentTarget &&
                onClose()
            }
        >
            <aside
                style={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label="Patient registration"
            >
                <div
                    style={styles.header}
                >
                    <div>
                        <p
                            style={
                                styles.eyebrow
                            }
                        >
                            ATHENA - PATIENT
                            ADMINISTRATION
                        </p>

                        <h2
                            style={
                                styles.title
                            }
                        >
                            Patient Registration
                        </h2>
                    </div>

                    <button
                        type="button"
                        style={styles.close}
                        onClick={onClose}
                        aria-label="Close"
                    >
                        X
                    </button>
                </div>

                {error && (
                    <div
                        style={
                            styles.error
                        }
                    >
                        {error}
                    </div>
                )}

                {success && (
                    <div
                        style={
                            styles.success
                        }
                    >
                        {success}
                    </div>
                )}

                <section
                    style={styles.section}
                >
                    <h3
                        style={
                            styles.sectionTitle
                        }
                    >
                        1. Select patient
                    </h3>

                    <label
                        style={styles.field}
                    >
                        <span
                            style={
                                styles.label
                            }
                        >
                            Search by name or
                            identifier
                        </span>

                        <input
                            style={
                                styles.input
                            }
                            value={search}
                            onChange={(
                                event
                            ) =>
                                setSearch(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="Search patients..."
                        />
                    </label>

                    <div
                        style={
                            styles.personList
                        }
                    >
                        {searching && (
                            <span>
                                Searching...
                            </span>
                        )}

                        {!searching &&
                            people.map(
                                (person) => (
                                    <button
                                        key={
                                            person.id
                                        }
                                        type="button"
                                        style={
                                            styles.personButton
                                        }
                                        onClick={() =>
                                            void choosePerson(
                                                person
                                            )
                                        }
                                    >
                                        <strong>
                                            {nameOf(
                                                person
                                            )}
                                        </strong>

                                        <br />

                                        <span>
                                            {person.primaryIdentifier ??
                                                "No identifier"}
                                            {" - "}
                                            {person.primaryFacilityName ??
                                                "No primary facility"}
                                        </span>
                                    </button>
                                )
                            )}
                    </div>

                    {selectedPerson &&
                        patient && (
                            <div
                                style={
                                    styles.selectedPerson
                                }
                            >
                                <strong>
                                    {nameOf(
                                        selectedPerson
                                    )}
                                </strong>

                                <br />

                                MRN:{" "}
                                {
                                    patient.medicalRecordNumber
                                }
                                {" - "}
                                Patient #:{" "}
                                {
                                    patient.patientNumber
                                }
                                {" - "}
                                {
                                    patient.status
                                }
                            </div>
                        )}
                </section>

                <form
                    onSubmit={(event) =>
                        void submit(event)
                    }
                >
                    <section
                        style={
                            styles.section
                        }
                    >
                        <h3
                            style={
                                styles.sectionTitle
                            }
                        >
                            2. Registration
                            details
                        </h3>

                        <div
                            style={
                                styles.grid
                            }
                        >
                            <label
                                style={
                                    styles.field
                                }
                            >
                                <span
                                    style={
                                        styles.label
                                    }
                                >
                                    Facility
                                </span>

                                <select
                                    style={
                                        styles.input
                                    }
                                    value={
                                        facilityId
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setFacilityId(
                                            event
                                                .target
                                                .value
                                        )
                                    }
                                    required
                                >
                                    <option value="">
                                        Select
                                        facility
                                    </option>

                                    {facilities.map(
                                        (
                                            facility
                                        ) => (
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

                            <label
                                style={
                                    styles.field
                                }
                            >
                                <span
                                    style={
                                        styles.label
                                    }
                                >
                                    Registration
                                    type
                                </span>

                                <select
                                    style={
                                        styles.input
                                    }
                                    value={
                                        registrationType
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setRegistrationType(
                                            event
                                                .target
                                                .value as RegistrationType
                                        )
                                    }
                                >
                                    <option value="OUTPATIENT">
                                        Outpatient
                                    </option>

                                    <option value="INPATIENT">
                                        Inpatient
                                    </option>

                                    <option value="EMERGENCY">
                                        Emergency
                                    </option>

                                    <option value="OBSERVATION">
                                        Observation
                                    </option>

                                    <option value="DAY_CASE">
                                        Day case
                                    </option>
                                </select>
                            </label>

                            <label
                                style={
                                    styles.field
                                }
                            >
                                <span
                                    style={
                                        styles.label
                                    }
                                >
                                    Source
                                </span>

                                <select
                                    style={
                                        styles.input
                                    }
                                    value={
                                        source
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setSource(
                                            event
                                                .target
                                                .value as RegistrationSource
                                        )
                                    }
                                >
                                    <option value="WALK_IN">
                                        Walk-in
                                    </option>

                                    <option value="REFERRAL">
                                        Referral
                                    </option>

                                    <option value="TRANSFER">
                                        Transfer
                                    </option>

                                    <option value="SCHEDULED">
                                        Scheduled
                                    </option>

                                    <option value="EMERGENCY">
                                        Emergency
                                    </option>

                                    <option value="OTHER">
                                        Other
                                    </option>
                                </select>
                            </label>

                            <label
                                style={
                                    styles.field
                                }
                            >
                                <span
                                    style={
                                        styles.label
                                    }
                                >
                                    Registration
                                    location
                                </span>

                                <input
                                    style={
                                        styles.input
                                    }
                                    value={
                                        registrationLocation
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setRegistrationLocation(
                                            event
                                                .target
                                                .value
                                        )
                                    }
                                    placeholder={
                                        selectedFacility
                                            ? `Location within ${selectedFacility.name}`
                                            : "e.g. Main Registration"
                                    }
                                />
                            </label>
                        </div>

                        <label
                            style={{
                                ...styles.field,
                                marginTop: 14
                            }}
                        >
                            <span
                                style={
                                    styles.label
                                }
                            >
                                Reason for visit
                            </span>

                            <textarea
                                style={
                                    styles.textarea
                                }
                                value={
                                    reasonForVisit
                                }
                                onChange={(
                                    event
                                ) =>
                                    setReasonForVisit(
                                        event
                                            .target
                                            .value
                                    )
                                }
                                placeholder="Reason for visit or registration notes"
                            />
                        </label>

                        <div
                            style={
                                styles.actions
                            }
                        >
                            <button
                                type="button"
                                style={
                                    styles.secondary
                                }
                                onClick={
                                    onClose
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                style={
                                    styles.primary
                                }
                                disabled={
                                    saving ||
                                    !patient ||
                                    !facilityId
                                }
                            >
                                {saving
                                    ? "Registering..."
                                    : "Create registration"}
                            </button>
                        </div>
                    </section>
                </form>

                {patient && (
                    <section
                        style={
                            styles.section
                        }
                    >
                        <h3
                            style={
                                styles.sectionTitle
                            }
                        >
                            Registration history (
                            {history.length})
                        </h3>

                        {history.length ===
                        0 ? (
                            <p>
                                No prior
                                registrations.
                            </p>
                        ) : (
                            <table
                                style={
                                    styles.history
                                }
                            >
                                <thead>
                                    <tr>
                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Registration
                                        </th>

                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Type
                                        </th>

                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Status
                                        </th>

                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Registered
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {history.map(
                                        (
                                            item
                                        ) => (
                                            <tr
                                                key={
                                                    item.id
                                                }
                                            >
                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        style={
                                                            styles.rowButton
                                                        }
                                                        onClick={() =>
                                                            setSelectedRegistrationId(
                                                                item.id
                                                            )
                                                        }
                                                    >
                                                        {
                                                            item.registrationNumber
                                                        }
                                                    </button>

                                                    <br />

                                                    {item.reasonForVisit ??
                                                        "--"}
                                                </td>

                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    {displayEnum(
                                                        item.registrationType
                                                    )}
                                                </td>

                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    {
                                                        item.status
                                                    }
                                                </td>

                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    {displayDate(
                                                        item.registeredAt
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                        )}

                        {selectedRegistration && (
                            <div
                                style={
                                    styles.details
                                }
                            >
                                <h4
                                    style={{
                                        margin:
                                            "0 0 12px",
                                        color:
                                            "#172033"
                                    }}
                                >
                                    Registration
                                    details
                                </h4>

                                <div
                                    style={
                                        styles.detailGrid
                                    }
                                >
                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Registration
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {
                                                selectedRegistration.registrationNumber
                                            }
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Status
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {
                                                selectedRegistration.status
                                            }
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Type / source
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayEnum(
                                                selectedRegistration.registrationType
                                            )}
                                            {" - "}
                                            {displayEnum(
                                                selectedRegistration.source
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Facility
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {facilities.find(
                                                (
                                                    item
                                                ) =>
                                                    item.id ===
                                                    selectedRegistration.facilityId
                                            )
                                                ?.name ??
                                                selectedRegistration.facilityId}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Registered
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayDate(
                                                selectedRegistration.registeredAt
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Completed
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayDate(
                                                selectedRegistration.completedAt
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Cancelled
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayDate(
                                                selectedRegistration.cancelledAt
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Version
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {
                                                selectedRegistration.version
                                            }
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Location
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {selectedRegistration.registrationLocation ??
                                                "--"}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Reason for
                                            visit
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {selectedRegistration.reasonForVisit ??
                                                "--"}
                                        </p>
                                    </div>
                                </div>

                                {encounterForSelectedRegistration && (
                                    <div
                                        style={{
                                            marginTop:
                                                14
                                        }}
                                    >
                                        <span
                                            style={
                                                styles.badge
                                            }
                                        >
                                            Encounter{" "}
                                            {
                                                encounterForSelectedRegistration.encounterNumber
                                            }{" "}
                                            -{" "}
                                            {displayEnum(
                                                encounterForSelectedRegistration.status
                                            )}
                                        </span>
                                    </div>
                                )}

                                {selectedRegistration.status ===
                                    "REGISTERED" && (
                                    <div
                                        style={
                                            styles.actions
                                        }
                                    >
                                        <button
                                            type="button"
                                            style={
                                                styles.danger
                                            }
                                            disabled={
                                                lifecycleSaving ||
                                                encounterSaving
                                            }
                                            onClick={() =>
                                                void transitionRegistration(
                                                    "CANCELLED"
                                                )
                                            }
                                        >
                                            Cancel
                                            registration
                                        </button>

                                        {!encounterForSelectedRegistration && (
                                            <button
                                                type="button"
                                                style={
                                                    styles.encounterAction
                                                }
                                                disabled={
                                                    lifecycleSaving ||
                                                    encounterSaving
                                                }
                                                onClick={() =>
                                                    void startEncounter()
                                                }
                                            >
                                                {encounterSaving
                                                    ? "Starting..."
                                                    : "Start Encounter"}
                                            </button>
                                        )}

                                        {encounterForSelectedRegistration && (
                                            <button
                                                type="button"
                                                style={
                                                    styles.secondary
                                                }
                                                onClick={() =>
                                                    setSelectedEncounterId(
                                                        encounterForSelectedRegistration.id
                                                    )
                                                }
                                            >
                                                View
                                                Encounter
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            style={
                                                styles.successAction
                                            }
                                            disabled={
                                                lifecycleSaving ||
                                                encounterSaving
                                            }
                                            onClick={() =>
                                                void transitionRegistration(
                                                    "COMPLETED"
                                                )
                                            }
                                        >
                                            Complete
                                            registration
                                        </button>
                                    </div>
                                )}

                                {selectedRegistration.status !==
                                    "REGISTERED" && (
                                    <p
                                        style={{
                                            margin:
                                                "14px 0 0",
                                            color:
                                                "#667085"
                                        }}
                                    >
                                        This
                                        registration is
                                        closed and cannot
                                        transition again.
                                    </p>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {patient && (
                    <section
                        style={
                            styles.section
                        }
                    >
                        <h3
                            style={
                                styles.sectionTitle
                            }
                        >
                            Encounters (
                            {encounters.length})
                        </h3>

                        {encounters.length ===
                        0 ? (
                            <p>
                                No encounters have
                                been created for this
                                patient.
                            </p>
                        ) : (
                            <table
                                style={
                                    styles.history
                                }
                            >
                                <thead>
                                    <tr>
                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Encounter
                                        </th>

                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Type
                                        </th>

                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Status
                                        </th>

                                        <th
                                            style={
                                                styles.th
                                            }
                                        >
                                            Started
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {encounters.map(
                                        (
                                            encounter
                                        ) => (
                                            <tr
                                                key={
                                                    encounter.id
                                                }
                                            >
                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    <button
                                                        type="button"
                                                        style={
                                                            styles.rowButton
                                                        }
                                                        onClick={() =>
                                                            setSelectedEncounterId(
                                                                encounter.id
                                                            )
                                                        }
                                                    >
                                                        {
                                                            encounter.encounterNumber
                                                        }
                                                    </button>

                                                    <br />

                                                    {encounter.reasonForEncounter ??
                                                        "--"}
                                                </td>

                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    {displayEnum(
                                                        encounter.encounterType
                                                    )}
                                                </td>

                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    {displayEnum(
                                                        encounter.status
                                                    )}
                                                </td>

                                                <td
                                                    style={
                                                        styles.td
                                                    }
                                                >
                                                    {displayDate(
                                                        encounter.startedAt
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    )}
                                </tbody>
                            </table>
                        )}

                        {selectedEncounter && (
                            <div
                                style={
                                    styles.encounterDetails
                                }
                            >
                                <h4
                                    style={{
                                        margin:
                                            "0 0 12px",
                                        color:
                                            "#172033"
                                    }}
                                >
                                    Encounter details
                                </h4>

                                <div
                                    style={
                                        styles.detailGrid
                                    }
                                >
                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Encounter
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {
                                                selectedEncounter.encounterNumber
                                            }
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Status
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayEnum(
                                                selectedEncounter.status
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Type
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayEnum(
                                                selectedEncounter.encounterType
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Source
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayEnum(
                                                selectedEncounter.source
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Facility
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {facilities.find(
                                                (
                                                    item
                                                ) =>
                                                    item.id ===
                                                    selectedEncounter.facilityId
                                            )
                                                ?.name ??
                                                selectedEncounter.facilityId}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Started
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayDate(
                                                selectedEncounter.startedAt
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Ended
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {displayDate(
                                                selectedEncounter.endedAt
                                            )}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Location
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {selectedEncounter.locationDescription ??
                                                "--"}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Reason
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {selectedEncounter.reasonForEncounter ??
                                                "--"}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Registration
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {selectedEncounter.registrationId
                                                ? history.find(
                                                      (
                                                          registration
                                                      ) =>
                                                          registration.id ===
                                                          selectedEncounter.registrationId
                                                  )
                                                      ?.registrationNumber ??
                                                  selectedEncounter.registrationId
                                                : "--"}
                                        </p>
                                    </div>

                                    <div>
                                        <span
                                            style={
                                                styles.label
                                            }
                                        >
                                            Version
                                        </span>

                                        <p
                                            style={
                                                styles.detailValue
                                            }
                                        >
                                            {
                                                selectedEncounter.version
                                            }
                                        </p>
                                    </div>
                                </div>

                                <AdtWorkspace
                                    tenantId={tenantId}
                                    encounter={{
                                        id:
                                            selectedEncounter.id,
                                        patientId:
                                            selectedEncounter.patientId,
                                        facilityId:
                                            selectedEncounter.facilityId,
                                        encounterNumber:
                                            selectedEncounter.encounterNumber,
                                        encounterType:
                                            selectedEncounter.encounterType,
                                        reasonForEncounter:
                                            selectedEncounter.reasonForEncounter
                                    }}
                                />

                                {encounterActions(
                                    selectedEncounter
                                ).length >
                                    0 && (
                                    <div
                                        style={
                                            styles.actions
                                        }
                                    >
                                        {encounterActions(
                                            selectedEncounter
                                        ).map(
                                            (
                                                nextStatus
                                            ) => (
                                                <button
                                                    key={
                                                        nextStatus
                                                    }
                                                    type="button"
                                                    style={
                                                        nextStatus ===
                                                        "CANCELLED"
                                                            ? styles.danger
                                                            : nextStatus ===
                                                              "ON_HOLD"
                                                            ? styles.warningAction
                                                            : styles.successAction
                                                    }
                                                    disabled={
                                                        encounterSaving
                                                    }
                                                    onClick={() =>
                                                        void transitionEncounter(
                                                            nextStatus
                                                        )
                                                    }
                                                >
                                                    {nextStatus ===
                                                    "IN_PROGRESS"
                                                        ? selectedEncounter.status ===
                                                          "ON_HOLD"
                                                            ? "Resume Encounter"
                                                            : "Begin Care"
                                                        : nextStatus ===
                                                          "ON_HOLD"
                                                        ? "Place On Hold"
                                                        : nextStatus ===
                                                          "FINISHED"
                                                        ? "Finish Encounter"
                                                        : nextStatus ===
                                                          "ARRIVED"
                                                        ? "Mark Arrived"
                                                        : "Cancel Encounter"}
                                                </button>
                                            )
                                        )}
                                    </div>
                                )}

                                {(selectedEncounter.status ===
                                    "FINISHED" ||
                                    selectedEncounter.status ===
                                        "CANCELLED") && (
                                    <p
                                        style={{
                                            margin:
                                                "14px 0 0",
                                            color:
                                                "#667085"
                                        }}
                                    >
                                        This encounter
                                        is closed and
                                        cannot transition
                                        again.
                                    </p>
                                )}
                            </div>
                        )}
                    </section>
                )}
            </aside>
        </div>
    );
}