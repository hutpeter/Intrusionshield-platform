import {
    useMemo,
    useState
} from "react";

import type {
    CSSProperties
} from "react";

export type EncounterRecord = {
    id: string;
    patientId: string;
    facilityId: string;
    registrationId?: string;
    attendingPractitionerId?: string;
    encounterNumber: string;
    encounterType:
        | "OUTPATIENT"
        | "INPATIENT"
        | "EMERGENCY"
        | "OBSERVATION"
        | "DAY_CASE"
        | "VIRTUAL";
    status:
        | "PLANNED"
        | "ARRIVED"
        | "IN_PROGRESS"
        | "ON_HOLD"
        | "FINISHED"
        | "CANCELLED";
    source:
        | "REGISTRATION"
        | "SCHEDULED"
        | "WALK_IN"
        | "REFERRAL"
        | "TRANSFER"
        | "EMERGENCY"
        | "OTHER";
    startedAt: string;
    endedAt?: string;
    reasonForEncounter?: string;
    referralSource?: string;
    locationDescription?: string;
    version: number;
};

type FacilityOption = {
    id: string;
    code: string;
    name: string;
    facilityType: string;
};

type Props = {
    tenantId: string;
    patientId: string;
    encounters: EncounterRecord[];
    facilities: FacilityOption[];
    onRefresh: () => Promise<void>;
    onOpenAdt: (encounter: EncounterRecord) => void;
};

type EncounterStatus = EncounterRecord["status"];

const encounterTypes: EncounterRecord["encounterType"][] = [
    "OUTPATIENT",
    "INPATIENT",
    "EMERGENCY",
    "OBSERVATION",
    "DAY_CASE",
    "VIRTUAL"
];

const encounterSources: EncounterRecord["source"][] = [
    "REGISTRATION",
    "SCHEDULED",
    "WALK_IN",
    "REFERRAL",
    "TRANSFER",
    "EMERGENCY",
    "OTHER"
];

const transitions: Record<
    EncounterStatus,
    { status: EncounterStatus; label: string }[]
> = {
    PLANNED: [
        { status: "ARRIVED", label: "Mark Arrived" },
        { status: "CANCELLED", label: "Cancel Encounter" }
    ],
    ARRIVED: [
        { status: "IN_PROGRESS", label: "Start Encounter" },
        { status: "CANCELLED", label: "Cancel Encounter" }
    ],
    IN_PROGRESS: [
        { status: "ON_HOLD", label: "Place On Hold" },
        { status: "FINISHED", label: "Finish Encounter" }
    ],
    ON_HOLD: [
        { status: "IN_PROGRESS", label: "Resume Encounter" },
        { status: "FINISHED", label: "Finish Encounter" },
        { status: "CANCELLED", label: "Cancel Encounter" }
    ],
    FINISHED: [],
    CANCELLED: []
};

const styles: Record<string, CSSProperties> = {
    shell: {
        display: "grid",
        gap: 14
    },
    toolbar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap"
    },
    button: {
        border: "1px solid #b7c5d8",
        borderRadius: 8,
        background: "#ffffff",
        padding: "8px 12px",
        cursor: "pointer",
        fontWeight: 600
    },
    primaryButton: {
        border: "1px solid #2563eb",
        borderRadius: 8,
        background: "#2563eb",
        color: "#ffffff",
        padding: "8px 12px",
        cursor: "pointer",
        fontWeight: 700
    },
    dangerButton: {
        border: "1px solid #fecaca",
        borderRadius: 8,
        background: "#fff1f2",
        color: "#9f1239",
        padding: "8px 12px",
        cursor: "pointer",
        fontWeight: 600
    },
    card: {
        border: "1px solid #e4e7ec",
        borderRadius: 10,
        padding: 14,
        background: "#ffffff"
    },
    cardHeader: {
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
        flexWrap: "wrap"
    },
    status: {
        display: "inline-block",
        padding: "3px 8px",
        borderRadius: 999,
        background: "#eef4ff",
        color: "#1d4ed8",
        fontSize: 12,
        fontWeight: 700
    },
    muted: {
        color: "#667085",
        fontSize: 13,
        marginTop: 4
    },
    actions: {
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        marginTop: 12
    },
    form: {
        display: "grid",
        gap: 12,
        border: "1px solid #b2ccff",
        borderRadius: 10,
        padding: 14,
        background: "#f8fbff"
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        gap: 12
    },
    field: {
        display: "grid",
        gap: 5
    },
    label: {
        color: "#475467",
        fontSize: 12,
        fontWeight: 700
    },
    input: {
        minHeight: 38,
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        background: "#ffffff",
        padding: "7px 9px"
    },
    textarea: {
        minHeight: 74,
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        background: "#ffffff",
        padding: 9,
        resize: "vertical"
    },
    error: {
        border: "1px solid #fecaca",
        background: "#fff1f2",
        color: "#9f1239",
        borderRadius: 8,
        padding: 10
    },
    success: {
        border: "1px solid #bbf7d0",
        background: "#f0fdf4",
        color: "#166534",
        borderRadius: 8,
        padding: 10
    }
};

function display(value: string): string {
    return value.replaceAll("_", " ");
}

function makeEncounterNumber(): string {
    const now = new Date();
    const date =
        `${now.getFullYear()}` +
        `${now.getMonth() + 1}`.padStart(2, "0") +
        `${now.getDate()}`.padStart(2, "0");
    const time =
        `${now.getHours()}`.padStart(2, "0") +
        `${now.getMinutes()}`.padStart(2, "0") +
        `${now.getSeconds()}`.padStart(2, "0");
    const suffix = Math.floor(
        1000 + Math.random() * 9000
    );

    return `ENC-${date}${time}-${suffix}`;
}

async function errorMessage(
    response: Response
): Promise<string> {
    try {
        const body = await response.json() as {
            error?: string;
        };
        return body.error ??
            `Request failed (${response.status}).`;
    } catch {
        return `Request failed (${response.status}).`;
    }
}

export function EncounterManagement({
    tenantId,
    patientId,
    encounters,
    facilities,
    onRefresh,
    onOpenAdt
}: Props) {
    const [
        creating,
        setCreating
    ] = useState(false);

    const [
        facilityId,
        setFacilityId
    ] = useState(
        facilities[0]?.id ?? ""
    );

    const [
        encounterType,
        setEncounterType
    ] = useState<EncounterRecord["encounterType"]>(
        "OUTPATIENT"
    );

    const [
        status,
        setStatus
    ] = useState<"PLANNED" | "ARRIVED">(
        "ARRIVED"
    );

    const [
        source,
        setSource
    ] = useState<EncounterRecord["source"]>(
        "OTHER"
    );

    const [
        reason,
        setReason
    ] = useState("");

    const [
        referralSource,
        setReferralSource
    ] = useState("");

    const [
        locationDescription,
        setLocationDescription
    ] = useState("");

    const [
        saving,
        setSaving
    ] = useState(false);

    const [
        actionEncounterId,
        setActionEncounterId
    ] = useState<string | null>(null);

    const [
        error,
        setError
    ] = useState<string | null>(null);

    const [
        success,
        setSuccess
    ] = useState<string | null>(null);

    const ordered = useMemo(
        () => [...encounters].sort(
            (a, b) =>
                new Date(b.startedAt).getTime() -
                new Date(a.startedAt).getTime()
        ),
        [encounters]
    );

    const resetForm = () => {
        setEncounterType("OUTPATIENT");
        setStatus("ARRIVED");
        setSource("OTHER");
        setReason("");
        setReferralSource("");
        setLocationDescription("");
        setFacilityId(facilities[0]?.id ?? "");
    };

    const createEncounter = async () => {
        if (!facilityId) {
            setError("Select a facility.");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const payload = {
                patientId,
                facilityId,
                encounterNumber: makeEncounterNumber(),
                encounterType,
                status,
                source,
                startedAt: new Date().toISOString(),
                reasonForEncounter:
                    reason.trim() || undefined,
                referralSource:
                    referralSource.trim() || undefined,
                locationDescription:
                    locationDescription.trim() || undefined
            };

            const response = await fetch(
                "/api/v1/his/encounters",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-tenant-id": tenantId
                    },
                    body: JSON.stringify(payload)
                }
            );

            if (!response.ok) {
                throw new Error(
                    await errorMessage(response)
                );
            }

            setCreating(false);
            resetForm();
            setSuccess("Encounter created.");
            await onRefresh();
        } catch (reasonValue) {
            setError(
                reasonValue instanceof Error
                    ? reasonValue.message
                    : "Unable to create encounter."
            );
        } finally {
            setSaving(false);
        }
    };

    const transitionEncounter = async (
        encounter: EncounterRecord,
        nextStatus: EncounterStatus
    ) => {
        setActionEncounterId(encounter.id);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(
                `/api/v1/his/encounters/${encodeURIComponent(
                    encounter.id
                )}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "x-tenant-id": tenantId
                    },
                    body: JSON.stringify({
                        version: encounter.version,
                        status: nextStatus
                    })
                }
            );

            if (!response.ok) {
                const message =
                    await errorMessage(response);

                if (response.status === 409) {
                    await onRefresh();
                }

                throw new Error(message);
            }

            setSuccess(
                `Encounter ${encounter.encounterNumber} updated to ${display(
                    nextStatus
                )}.`
            );
            await onRefresh();
        } catch (reasonValue) {
            setError(
                reasonValue instanceof Error
                    ? reasonValue.message
                    : "Unable to update encounter."
            );
        } finally {
            setActionEncounterId(null);
        }
    };

    return (
        <div style={styles.shell}>
            <div style={styles.toolbar}>
                <div>
                    <strong>Encounter Management</strong>
                    <div style={styles.muted}>
                        Create encounters and manage their clinical lifecycle.
                    </div>
                </div>

                <button
                    type="button"
                    style={styles.primaryButton}
                    onClick={() => {
                        setCreating((current) => !current);
                        setError(null);
                        setSuccess(null);
                        if (!facilityId && facilities[0]) {
                            setFacilityId(facilities[0].id);
                        }
                    }}
                >
                    {creating
                        ? "Close"
                        : "+ Create Encounter"}
                </button>
            </div>

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

            {creating && (
                <div style={styles.form}>
                    <strong>New Encounter</strong>

                    <div style={styles.grid}>
                        <label style={styles.field}>
                            <span style={styles.label}>
                                Facility
                            </span>
                            <select
                                style={styles.input}
                                value={facilityId}
                                onChange={(event) =>
                                    setFacilityId(
                                        event.target.value
                                    )
                                }
                            >
                                <option value="">
                                    Select facility
                                </option>
                                {facilities.map(
                                    (facility) => (
                                        <option
                                            key={facility.id}
                                            value={facility.id}
                                        >
                                            {facility.name} ({facility.code})
                                        </option>
                                    )
                                )}
                            </select>
                        </label>

                        <label style={styles.field}>
                            <span style={styles.label}>
                                Encounter type
                            </span>
                            <select
                                style={styles.input}
                                value={encounterType}
                                onChange={(event) =>
                                    setEncounterType(
                                        event.target.value as
                                            EncounterRecord["encounterType"]
                                    )
                                }
                            >
                                {encounterTypes.map(
                                    (value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {display(value)}
                                        </option>
                                    )
                                )}
                            </select>
                        </label>

                        <label style={styles.field}>
                            <span style={styles.label}>
                                Initial status
                            </span>
                            <select
                                style={styles.input}
                                value={status}
                                onChange={(event) =>
                                    setStatus(
                                        event.target.value as
                                            "PLANNED" | "ARRIVED"
                                    )
                                }
                            >
                                <option value="PLANNED">
                                    PLANNED
                                </option>
                                <option value="ARRIVED">
                                    ARRIVED
                                </option>
                            </select>
                        </label>

                        <label style={styles.field}>
                            <span style={styles.label}>
                                Source
                            </span>
                            <select
                                style={styles.input}
                                value={source}
                                onChange={(event) =>
                                    setSource(
                                        event.target.value as
                                            EncounterRecord["source"]
                                    )
                                }
                            >
                                {encounterSources.map(
                                    (value) => (
                                        <option
                                            key={value}
                                            value={value}
                                        >
                                            {display(value)}
                                        </option>
                                    )
                                )}
                            </select>
                        </label>

                        <label style={styles.field}>
                            <span style={styles.label}>
                                Referral source
                            </span>
                            <input
                                style={styles.input}
                                value={referralSource}
                                onChange={(event) =>
                                    setReferralSource(
                                        event.target.value
                                    )
                                }
                            />
                        </label>

                        <label style={styles.field}>
                            <span style={styles.label}>
                                Location description
                            </span>
                            <input
                                style={styles.input}
                                value={locationDescription}
                                onChange={(event) =>
                                    setLocationDescription(
                                        event.target.value
                                    )
                                }
                            />
                        </label>
                    </div>

                    <label style={styles.field}>
                        <span style={styles.label}>
                            Reason for encounter
                        </span>
                        <textarea
                            style={styles.textarea}
                            value={reason}
                            onChange={(event) =>
                                setReason(
                                    event.target.value
                                )
                            }
                        />
                    </label>

                    <div style={styles.actions}>
                        <button
                            type="button"
                            style={styles.primaryButton}
                            disabled={saving}
                            onClick={() =>
                                void createEncounter()
                            }
                        >
                            {saving
                                ? "Creating..."
                                : "Create Encounter"}
                        </button>

                        <button
                            type="button"
                            style={styles.button}
                            disabled={saving}
                            onClick={() => {
                                setCreating(false);
                                resetForm();
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {ordered.length === 0 ? (
                <div style={styles.card}>
                    No encounters are recorded for this Patient.
                </div>
            ) : (
                ordered.map((encounter) => (
                    <div
                        key={encounter.id}
                        style={styles.card}
                    >
                        <div style={styles.cardHeader}>
                            <div>
                                <strong>
                                    {encounter.encounterNumber}
                                </strong>
                                <div style={styles.muted}>
                                    {display(
                                        encounter.encounterType
                                    )}{" "}
                                    · {display(encounter.source)}
                                </div>
                                <div style={styles.muted}>
                                    {new Date(
                                        encounter.startedAt
                                    ).toLocaleString()}
                                </div>
                            </div>

                            <span style={styles.status}>
                                {display(encounter.status)}
                            </span>
                        </div>

                        {encounter.reasonForEncounter && (
                            <div style={styles.muted}>
                                {encounter.reasonForEncounter}
                            </div>
                        )}

                        {encounter.locationDescription && (
                            <div style={styles.muted}>
                                Location:{" "}
                                {encounter.locationDescription}
                            </div>
                        )}

                        {encounter.endedAt && (
                            <div style={styles.muted}>
                                Ended:{" "}
                                {new Date(
                                    encounter.endedAt
                                ).toLocaleString()}
                            </div>
                        )}

                        <div style={styles.actions}>
                            {transitions[
                                encounter.status
                            ].map((transition) => (
                                <button
                                    key={transition.status}
                                    type="button"
                                    style={
                                        transition.status ===
                                        "CANCELLED"
                                            ? styles.dangerButton
                                            : styles.button
                                    }
                                    disabled={
                                        actionEncounterId ===
                                        encounter.id
                                    }
                                    onClick={() =>
                                        void transitionEncounter(
                                            encounter,
                                            transition.status
                                        )
                                    }
                                >
                                    {actionEncounterId ===
                                    encounter.id
                                        ? "Updating..."
                                        : transition.label}
                                </button>
                            ))}

                            {encounter.status !==
                                "CANCELLED" && (
                                <button
                                    type="button"
                                    style={styles.button}
                                    onClick={() =>
                                        onOpenAdt(encounter)
                                    }
                                >
                                    Open ADT / Bed Management
                                </button>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
