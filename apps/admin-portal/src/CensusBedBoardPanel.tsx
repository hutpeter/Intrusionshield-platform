import {
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";
import type { CSSProperties } from "react";

type FacilityOption = {
    id: string;
    code: string;
    name: string;
    facilityType: string;
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

type BedOperationalStatus =
    | "AVAILABLE"
    | "OCCUPIED"
    | "RESERVED"
    | "CLEANING"
    | "BLOCKED"
    | "MAINTENANCE"
    | "OUT_OF_SERVICE";

type Bed = {
    id: string;
    facilityId: string;
    locationId: string;
    code: string;
    name: string;
    bedType: string;
    status: "ACTIVE" | "INACTIVE";
    operationalStatus: BedOperationalStatus;
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
    status: "ACTIVE" | "DISCHARGED" | "CANCELLED";
    admittedAt: string;
    admissionType: string;
    admissionSource: string;
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

type ListResponse<T> = {
    items: T[];
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
        background: "rgba(15, 23, 42, 0.42)",
        zIndex: 1200,
        display: "flex",
        justifyContent: "flex-end"
    },
    panel: {
        width: "min(1180px, 96vw)",
        height: "100vh",
        overflowY: "auto",
        background: "#f8fafc",
        boxShadow: "-12px 0 32px rgba(15, 23, 42, 0.18)"
    },
    header: {
        position: "sticky",
        top: 0,
        zIndex: 2,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        padding: "22px 26px",
        background: "#ffffff",
        borderBottom: "1px solid #e2e8f0"
    },
    eyebrow: {
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
        color: "#64748b",
        textTransform: "uppercase"
    },
    title: {
        margin: "4px 0 0",
        fontSize: 24,
        color: "#172033"
    },
    close: {
        border: "1px solid #cbd5e1",
        background: "#fff",
        borderRadius: 8,
        width: 36,
        height: 36,
        cursor: "pointer",
        fontSize: 20
    },
    body: {
        padding: 26
    },
    toolbar: {
        display: "flex",
        gap: 12,
        alignItems: "end",
        flexWrap: "wrap",
        marginBottom: 20
    },
    field: {
        display: "grid",
        gap: 6,
        minWidth: 300
    },
    label: {
        fontSize: 12,
        fontWeight: 700,
        color: "#475569"
    },
    select: {
        minHeight: 40,
        border: "1px solid #cbd5e1",
        borderRadius: 8,
        background: "#fff",
        padding: "0 10px"
    },
    button: {
        minHeight: 40,
        border: "1px solid #b7c5d8",
        borderRadius: 8,
        background: "#fff",
        padding: "0 14px",
        cursor: "pointer",
        fontWeight: 600
    },
    cards: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
        gap: 12,
        marginBottom: 22
    },
    card: {
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 16
    },
    cardLabel: {
        color: "#64748b",
        fontSize: 12,
        fontWeight: 700
    },
    cardValue: {
        color: "#172033",
        fontSize: 28,
        fontWeight: 700,
        marginTop: 6
    },
    tableWrap: {
        overflowX: "auto",
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 10
    },
    table: {
        width: "100%",
        borderCollapse: "collapse"
    },
    th: {
        textAlign: "left",
        padding: "12px 14px",
        borderBottom: "1px solid #e2e8f0",
        color: "#475569",
        fontSize: 12,
        fontWeight: 700,
        background: "#f8fafc"
    },
    td: {
        padding: "13px 14px",
        borderBottom: "1px solid #eef2f7",
        color: "#334155",
        fontSize: 13,
        verticalAlign: "top"
    },
    strong: {
        color: "#172033",
        fontWeight: 700
    },
    muted: {
        color: "#64748b",
        fontSize: 12,
        marginTop: 3
    },
    message: {
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 18,
        color: "#475569"
    },
    error: {
        background: "#fff1f2",
        border: "1px solid #fecdd3",
        color: "#9f1239",
        borderRadius: 10,
        padding: 14,
        marginBottom: 18
    }
};

async function api<T>(
    url: string,
    tenantId: string
): Promise<T> {
    const response = await fetch(url, {
        headers: {
            "x-tenant-id": tenantId
        }
    });

    if (!response.ok) {
        let message = `Request failed (${response.status}).`;

        try {
            const body = await response.json() as {
                error?: string;
            };
            if (body.error) {
                message = body.error;
            }
        } catch {
            // Keep the HTTP status message.
        }

        throw new Error(message);
    }

    return await response.json() as T;
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString();
}

function display(value: string): string {
    return value.replaceAll("_", " ");
}

export function CensusBedBoardPanel({
    tenantId,
    onClose
}: Props) {
    const [
        facilities,
        setFacilities
    ] = useState<FacilityOption[]>([]);

    const [
        facilityId,
        setFacilityId
    ] = useState("");

    const [
        census,
        setCensus
    ] = useState<CensusItem[]>([]);

    const [
        beds,
        setBeds
    ] = useState<Bed[]>([]);

    const [
        loading,
        setLoading
    ] = useState(true);

    const [
        error,
        setError
    ] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const loadFacilities = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await api<FacilityOption[]>(
                    "/api/v1/his/facilities/options",
                    tenantId
                );

                if (!active) return;

                const items = Array.isArray(result)
                    ? result
                    : [];

                setFacilities(items);
                setFacilityId((current) =>
                    current || items[0]?.id || ""
                );
            } catch (reason) {
                if (!active) return;
                setError(
                    reason instanceof Error
                        ? reason.message
                        : "Unable to load facilities."
                );
                setLoading(false);
            }
        };

        void loadFacilities();

        return () => {
            active = false;
        };
    }, [tenantId]);

    const loadBoard = useCallback(async () => {
        if (!facilityId) {
            setCensus([]);
            setBeds([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const [
                censusResult,
                locationResult
            ] = await Promise.all([
                api<ListResponse<CensusItem>>(
                    `/api/v1/his/admissions?facilityId=${encodeURIComponent(
                        facilityId
                    )}&status=ACTIVE`,
                    tenantId
                ),
                api<ListResponse<ClinicalLocation>>(
                    `/api/v1/his/facilities/${encodeURIComponent(
                        facilityId
                    )}/locations`,
                    tenantId
                )
            ]);

            const locations =
                locationResult?.items ?? [];

            const bedResults = await Promise.all(
                locations
                    .filter(
                        (location) =>
                            location.status === "ACTIVE"
                    )
                    .map((location) =>
                        api<ListResponse<Bed>>(
                            `/api/v1/his/locations/${encodeURIComponent(
                                location.id
                            )}/beds`,
                            tenantId
                        )
                    )
            );

            setCensus(censusResult?.items ?? []);
            setBeds(
                bedResults.flatMap(
                    (result) => result?.items ?? []
                )
            );
        } catch (reason) {
            setError(
                reason instanceof Error
                    ? reason.message
                    : "Unable to load Census / Bed Board."
            );
        } finally {
            setLoading(false);
        }
    }, [facilityId, tenantId]);

    useEffect(() => {
        if (facilityId) {
            void loadBoard();
        }
    }, [facilityId, loadBoard]);

    const activeBeds = useMemo(
        () =>
            beds.filter(
                (bed) => bed.status === "ACTIVE"
            ),
        [beds]
    );

    const bedCount = useCallback(
        (status: BedOperationalStatus) =>
            activeBeds.filter(
                (bed) =>
                    bed.operationalStatus === status
            ).length,
        [activeBeds]
    );

    const awaitingBed = useMemo(
        () =>
            census.filter(
                (item) => !item.bedId
            ).length,
        [census]
    );

    const selectedFacility =
        facilities.find(
            (facility) =>
                facility.id === facilityId
        );

    return (
        <div
            style={styles.backdrop}
            role="presentation"
            onMouseDown={(event) => {
                if (
                    event.target ===
                    event.currentTarget
                ) {
                    onClose();
                }
            }}
        >
            <section
                style={styles.panel}
                role="dialog"
                aria-modal="true"
                aria-label="Athena Census / Bed Board"
            >
                <header style={styles.header}>
                    <div>
                        <div style={styles.eyebrow}>
                            Athena · ADT & Bed Management
                        </div>
                        <h2 style={styles.title}>
                            Census / Bed Board
                        </h2>
                    </div>

                    <button
                        type="button"
                        style={styles.close}
                        onClick={onClose}
                        aria-label="Close Census / Bed Board"
                    >
                        ×
                    </button>
                </header>

                <div style={styles.body}>
                    <div style={styles.toolbar}>
                        <label style={styles.field}>
                            <span style={styles.label}>
                                Facility
                            </span>
                            <select
                                style={styles.select}
                                value={facilityId}
                                onChange={(event) =>
                                    setFacilityId(
                                        event.target.value
                                    )
                                }
                            >
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

                        <button
                            type="button"
                            style={styles.button}
                            onClick={() =>
                                void loadBoard()
                            }
                            disabled={
                                loading || !facilityId
                            }
                        >
                            Refresh
                        </button>

                        {selectedFacility && (
                            <div style={styles.muted}>
                                {selectedFacility.facilityType}
                            </div>
                        )}
                    </div>

                    {error && (
                        <div style={styles.error}>
                            {error}
                        </div>
                    )}

                    <div style={styles.cards}>
                        <div style={styles.card}>
                            <div style={styles.cardLabel}>
                                Active patients
                            </div>
                            <div style={styles.cardValue}>
                                {census.length}
                            </div>
                        </div>
                        <div style={styles.card}>
                            <div style={styles.cardLabel}>
                                Occupied beds
                            </div>
                            <div style={styles.cardValue}>
                                {bedCount("OCCUPIED")}
                            </div>
                        </div>
                        <div style={styles.card}>
                            <div style={styles.cardLabel}>
                                Available beds
                            </div>
                            <div style={styles.cardValue}>
                                {bedCount("AVAILABLE")}
                            </div>
                        </div>
                        <div style={styles.card}>
                            <div style={styles.cardLabel}>
                                Awaiting bed
                            </div>
                            <div style={styles.cardValue}>
                                {awaitingBed}
                            </div>
                        </div>
                        <div style={styles.card}>
                            <div style={styles.cardLabel}>
                                Cleaning
                            </div>
                            <div style={styles.cardValue}>
                                {bedCount("CLEANING")}
                            </div>
                        </div>
                        <div style={styles.card}>
                            <div style={styles.cardLabel}>
                                Reserved / blocked
                            </div>
                            <div style={styles.cardValue}>
                                {bedCount("RESERVED") +
                                    bedCount("BLOCKED")}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div style={styles.message}>
                            Loading Census / Bed Board...
                        </div>
                    ) : census.length === 0 ? (
                        <div style={styles.message}>
                            No active admissions are currently recorded for this facility.
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
                                    {census.map((item) => (
                                        <tr key={item.admissionId}>
                                            <td style={styles.td}>
                                                <div style={styles.strong}>
                                                    {item.patientName}
                                                </div>
                                                <div style={styles.muted}>
                                                    MRN {item.medicalRecordNumber}
                                                </div>
                                                <div style={styles.muted}>
                                                    {item.patientNumber}
                                                </div>
                                            </td>
                                            <td style={styles.td}>
                                                <div style={styles.strong}>
                                                    {item.admissionNumber}
                                                </div>
                                                {item.reasonForAdmission && (
                                                    <div style={styles.muted}>
                                                        {item.reasonForAdmission}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={styles.td}>
                                                {item.bedId ? (
                                                    <>
                                                        <div style={styles.strong}>
                                                            {item.locationName ??
                                                                item.locationCode ??
                                                                "Location"}
                                                        </div>
                                                        <div style={styles.muted}>
                                                            {item.bedName ??
                                                                item.bedCode ??
                                                                "Bed"}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span style={styles.strong}>
                                                        Awaiting bed
                                                    </span>
                                                )}
                                            </td>
                                            <td style={styles.td}>
                                                {display(item.admissionType)}
                                            </td>
                                            <td style={styles.td}>
                                                {formatDateTime(item.admittedAt)}
                                            </td>
                                            <td style={styles.td}>
                                                {display(item.status)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
