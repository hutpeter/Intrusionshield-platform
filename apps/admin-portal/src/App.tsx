import {
    useEffect,
    useMemo,
    useState
} from "react";

import type {
    CSSProperties
} from "react";

import { PatientRegistrationPanel } from "./PatientRegistrationPanel";
import { HospitalStructurePanel } from "./HospitalStructurePanel";
import { SchedulingPanel } from "./SchedulingPanel";
import { AdtWorkspace } from "./AdtWorkspace";
import { CensusBedBoardPanel } from "./CensusBedBoardPanel";
import { EncounterManagement } from "./EncounterManagement";
import { BasDashboard } from "./BasDashboard";
import { EnergyContracts } from "./EnergyContracts";
import { TradeResources } from "./TradeResources";
import { AdministrationWorkspace } from "./AdministrationWorkspace";

import {
    useAuth
} from "./auth/index.js";

import {
    LanguageSelector,
    useI18n
} from "./i18n/index.js";

type PatientRecord = {
    id: string;
    tenantId: string;
    personId: string;
    medicalRecordNumber: string;
    patientNumber: string;
    status: string;
};

type EncounterRecord = {
    id: string;
    patientId: string;
    facilityId: string;
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
    registrationId?: string;
    attendingPractitionerId?: string;
    startedAt: string;
    endedAt?: string;
    reasonForEncounter?: string;
    referralSource?: string;
    locationDescription?: string;
    version: number;
};

type EncounterListResponse = {
    items: EncounterRecord[];
    total: number;
};

type PatientClinicalView =
    | "OVERVIEW"
    | "ENCOUNTERS"
    | "ADT";

type NavigationKey =
    | "dashboard"
    | "athena"
    | "ems"
    | "compliance"
    | "workflow"
    | "security"
    | "aiHub"
    | "administration"
    | "audit";

type NavigationItem = {
    key: NavigationKey;
    labelKey: import("./i18n/index.js").TranslationKey;
    icon: string;
};

type PersonStatus =
    | "ACTIVE"
    | "INACTIVE"
    | "DECEASED";

type PersonRole =
    | "PATIENT"
    | "PRACTITIONER";

type Sex =
    | "UNKNOWN"
    | "MALE"
    | "FEMALE"
    | "INTERSEX"
    | "OTHER";

type PersonIdentifierEditForm = {
    system: string;
    value: string;
};

type PersonAddressEditForm = {
    line1: string;
    line2: string;
    city: string;
    provinceOrState: string;
    postalCode: string;
    country: string;
};

type PersonEditForm = {
    firstName: string;
    middleName: string;
    lastName: string;
    preferredName: string;
    dateOfBirth: string;
    sex: Sex;
    gender: string;
    email: string;
    phone: string;
    mobilePhone: string;
    identifiers: PersonIdentifierEditForm[];
    addresses: PersonAddressEditForm[];
};

type PersonScalarEditField = Exclude<
    keyof PersonEditForm,
    "identifiers" | "addresses"
>;

type PersonListItem = {
    id: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    preferredName?: string;
    status: PersonStatus;
    primaryIdentifier?: string;
    primaryFacilityId?: string;
    primaryFacilityName?: string;
    roles?: PersonRole[];
    updatedAt: string;
};

type PersonListResponse = {
    items: PersonListItem[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
};


type PersonIdentifier = {
    system: string;
    value: string;
};

type PersonAddress = {
    line1: string;
    line2?: string;
    city: string;
    provinceOrState?: string;
    postalCode?: string;
    country: string;
};

type PersonContactInformation = {
    email?: string;
    phone?: string;
    mobilePhone?: string;
};

type PersonDetail = {
    id: string;
    tenantId: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    preferredName?: string;
    dateOfBirth?: string;
    sex: Sex;
    gender?: string;
    identifiers: PersonIdentifier[];
    contactInformation?: PersonContactInformation;
    addresses: PersonAddress[];
    status: PersonStatus;
    createdAt: string;
    updatedAt: string;
    version: number;
};

type PersonSummaryResponse = {
    totalPersons: number;
    totalPatients: number;
    totalPractitioners: number;
};

type PersonFacilityAffiliationType =
    | "PATIENT_CARE"
    | "PRACTITIONER_ASSIGNMENT"
    | "GENERAL";

type FacilityOption = {
    id: string;
    code: string;
    name: string;
    facilityType: string;
};

type PersonFacilityAffiliation = {
    id: string;
    facilityId: string;
    facilityCode: string;
    facilityName: string;
    affiliationType: PersonFacilityAffiliationType;
    isPrimary: boolean;
    effectiveFrom: string;
    effectiveUntil?: string;
    version: number;
};

type PersonFacilityAffiliationEditForm = {
    facilityId: string;
    affiliationType: PersonFacilityAffiliationType;
    isPrimary: boolean;
};

type PaginationItem =
    | number
    | "ellipsis";

const navigation: NavigationItem[] = [
    { key: "dashboard", labelKey: "shell.navigation.dashboard", icon: "" },
    { key: "athena", labelKey: "shell.navigation.athena", icon: "" },
    { key: "ems", labelKey: "shell.navigation.ems", icon: "" },
    { key: "compliance", labelKey: "shell.navigation.compliance", icon: "" },
    { key: "workflow", labelKey: "shell.navigation.workflow", icon: "" },
    { key: "security", labelKey: "shell.navigation.security", icon: "" },
    { key: "aiHub", labelKey: "shell.navigation.aiHub", icon: "" }
];

const administrationNavigation: NavigationItem[] = [
    { key: "administration", labelKey: "shell.navigation.administration", icon: "" },
    { key: "audit", labelKey: "shell.navigation.audit", icon: "" }
];

const PAGE_SIZE = 25;

const emptyResult: PersonListResponse = {
    items: [],
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 0
};


const detailStyles: Record<
    string,
    CSSProperties
> = {
    backdrop: {
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background:
            "rgba(15, 23, 42, 0.44)",
        display: "flex",
        justifyContent: "flex-end"
    },
    drawer: {
        width: "min(620px, 100vw)",
        height: "100vh",
        overflowY: "auto",
        background: "#ffffff",
        boxShadow:
            "-12px 0 30px rgba(15, 23, 42, 0.18)",
        padding: "28px"
    },
    drawerHeader: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "20px",
        marginBottom: "24px"
    },
    eyebrow: {
        margin: "0 0 6px",
        color: "#667085",
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase"
    },
    title: {
        margin: 0,
        color: "#172033",
        fontSize: "28px",
        lineHeight: 1.2
    },
    subtitle: {
        margin: "8px 0 0",
        color: "#667085",
        fontSize: "14px",
        wordBreak: "break-all"
    },
    closeButton: {
        border: "1px solid #d9dee8",
        borderRadius: "8px",
        background: "#ffffff",
        color: "#344054",
        width: "38px",
        height: "38px",
        fontSize: "20px"
    },
    badgeRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        marginBottom: "24px"
    },
    badge: {
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid #dbe3ef",
        borderRadius: "999px",
        background: "#f8fafc",
        color: "#344054",
        padding: "6px 10px",
        fontSize: "12px",
        fontWeight: 700
    },
    section: {
        borderTop: "1px solid #e6eaf0",
        padding: "22px 0"
    },
    sectionTitle: {
        margin: "0 0 16px",
        color: "#172033",
        fontSize: "15px"
    },
    grid: {
        display: "grid",
        gridTemplateColumns:
            "repeat(2, minmax(0, 1fr))",
        gap: "16px 22px"
    },
    field: {
        minWidth: 0
    },
    label: {
        display: "block",
        marginBottom: "5px",
        color: "#667085",
        fontSize: "12px",
        fontWeight: 700
    },
    value: {
        color: "#172033",
        fontSize: "14px",
        lineHeight: 1.5,
        wordBreak: "break-word"
    },
    list: {
        margin: 0,
        paddingLeft: "18px",
        color: "#172033",
        fontSize: "14px",
        lineHeight: 1.7
    },
    message: {
        padding: "28px 0",
        color: "#667085",
        fontSize: "14px"
    },
    headerActions: {
        display: "flex",
        alignItems: "center",
        gap: "8px"
    },
    editButton: {
        border: "1px solid #d0d5dd",
        borderRadius: "8px",
        background: "#ffffff",
        color: "#344054",
        minHeight: "38px",
        padding: "0 14px",
        fontSize: "13px",
        fontWeight: 700
    },
    input: {
        width: "100%",
        minHeight: "40px",
        border: "1px solid #d0d5dd",
        borderRadius: "8px",
        background: "#ffffff",
        color: "#172033",
        padding: "8px 10px",
        fontSize: "14px",
        outline: "none"
    },
    actionRow: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "10px",
        margin: "0 0 18px"
    },
    cancelButton: {
        border: "1px solid #d0d5dd",
        borderRadius: "8px",
        background: "#ffffff",
        color: "#344054",
        minHeight: "40px",
        padding: "0 16px",
        fontSize: "13px",
        fontWeight: 700
    },
    saveButton: {
        border: "1px solid #172033",
        borderRadius: "8px",
        background: "#172033",
        color: "#ffffff",
        minHeight: "40px",
        padding: "0 18px",
        fontSize: "13px",
        fontWeight: 700
    },
    collectionCard: {
        border: "1px solid #e1e6ee",
        borderRadius: "10px",
        background: "#fafbfc",
        padding: "14px",
        marginBottom: "12px"
    },
    collectionHeader: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        marginBottom: "12px"
    },
    collectionTitle: {
        color: "#344054",
        fontSize: "13px",
        fontWeight: 700
    },
    addButton: {
        border: "1px solid #d0d5dd",
        borderRadius: "8px",
        background: "#ffffff",
        color: "#344054",
        minHeight: "36px",
        padding: "0 12px",
        fontSize: "12px",
        fontWeight: 700
    },
    removeButton: {
        border: "none",
        background: "transparent",
        color: "#b42318",
        padding: "4px 0",
        fontSize: "12px",
        fontWeight: 700
    },
    emptyEditor: {
        border: "1px dashed #d0d5dd",
        borderRadius: "8px",
        color: "#667085",
        padding: "14px",
        fontSize: "13px",
        marginBottom: "12px"
    },
    checkboxRow: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        color: "#344054",
        fontSize: "13px",
        fontWeight: 600
    },
    select: {
        width: "100%",
        minHeight: "40px",
        border: "1px solid #d0d5dd",
        borderRadius: "8px",
        background: "#ffffff",
        color: "#172033",
        padding: "8px 10px",
        fontSize: "14px",
        outline: "none"
    },
    error: {
        padding: "14px",
        borderRadius: "8px",
        background: "#fff4f4",
        color: "#b42318",
        fontSize: "14px"
    },
    success: {
        padding: "12px 14px",
        marginBottom: "16px",
        borderRadius: "8px",
        background: "#ecfdf3",
        color: "#027a48",
        fontSize: "14px"
    }
};

function formatPersonName(
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

function formatStatus(
    status: PersonStatus
): string {
    switch (status) {
        case "ACTIVE":
            return "Active";

        case "INACTIVE":
            return "Inactive";

        case "DECEASED":
            return "Deceased";
    }
}

function formatPersonType(
    roles?: readonly PersonRole[]
): string {
    const safeRoles =
        roles ?? [];

    const isPatient =
        safeRoles.includes("PATIENT");

    const isPractitioner =
        safeRoles.includes("PRACTITIONER");

    if (
        isPatient &&
        isPractitioner
    ) {
        return "Patient / Practitioner";
    }

    if (isPatient) {
        return "Patient";
    }

    if (isPractitioner) {
        return "Practitioner";
    }

    return "Person";
}

function formatUpdatedDate(
    value: string
): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "--";
    }

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            month: "short",
            day: "numeric",
            year: "numeric"
        }
    ).format(date);
}

function formatOptionalDate(
    value?: string
): string {
    if (!value) {
        return "--";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "--";
    }

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            year: "numeric",
            month: "short",
            day: "numeric"
        }
    ).format(date);
}

function toDateInputValue(
    value?: string
): string {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date
        .toISOString()
        .slice(0, 10);
}

function createPersonEditForm(
    person: PersonDetail
): PersonEditForm {
    return {
        firstName:
            person.firstName,
        middleName:
            person.middleName ?? "",
        lastName:
            person.lastName,
        preferredName:
            person.preferredName ?? "",
        dateOfBirth:
            toDateInputValue(
                person.dateOfBirth
            ),
        sex:
            person.sex,
        gender:
            person.gender ?? "",
        email:
            person.contactInformation
                ?.email ?? "",
        phone:
            person.contactInformation
                ?.phone ?? "",
        mobilePhone:
            person.contactInformation
                ?.mobilePhone ?? "",
        identifiers:
            person.identifiers.map(
                (identifier) => ({
                    system:
                        identifier.system,
                    value:
                        identifier.value
                })
            ),
        addresses:
            person.addresses.map(
                (address) => ({
                    line1:
                        address.line1,
                    line2:
                        address.line2 ?? "",
                    city:
                        address.city,
                    provinceOrState:
                        address.provinceOrState ?? "",
                    postalCode:
                        address.postalCode ?? "",
                    country:
                        address.country
                })
            )
    };
}

function optionalValue(
    value: string
): string | undefined {
    const normalized =
        value.trim();

    return normalized
        ? normalized
        : undefined;
}

function formatDetailName(
    person: PersonDetail
): string {
    return [
        person.firstName,
        person.middleName,
        person.lastName
    ]
        .filter(Boolean)
        .join(" ");
}

function formatAddress(
    address: PersonAddress
): string {
    return [
        address.line1,
        address.line2,
        address.city,
        address.provinceOrState,
        address.postalCode,
        address.country
    ]
        .filter(Boolean)
        .join(", ");
}

function getPersonInitials(
    person: PersonListItem
): string {
    const values = [
        person.firstName,
        person.lastName
    ].filter(Boolean);

    return values
        .map((value) => value[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
}

function createPaginationItems(
    currentPage: number,
    totalPages: number
): PaginationItem[] {
    if (totalPages <= 1) {
        return totalPages === 1
            ? [1]
            : [];
    }

    if (totalPages <= 7) {
        return Array.from(
            { length: totalPages },
            (_, index) => index + 1
        );
    }

    if (currentPage <= 4) {
        return [
            1,
            2,
            3,
            4,
            5,
            "ellipsis",
            totalPages
        ];
    }

    if (currentPage >= totalPages - 3) {
        return [
            1,
            "ellipsis",
            totalPages - 4,
            totalPages - 3,
            totalPages - 2,
            totalPages - 1,
            totalPages
        ];
    }

    return [
        1,
        "ellipsis",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "ellipsis",
        totalPages
    ];
}

function App() {
    const { identity, logout } = useAuth();
    const { locale, t } = useI18n();

    if (!identity) {
        throw new Error(
            "Authenticated identity is unavailable."
        );
    }

    const tenantId = identity.tenantId;

    const formatStatusLabel = (status: PersonStatus): string => {
        switch (status) {
            case "ACTIVE": return t("athena.ui.active");
            case "INACTIVE": return t("athena.ui.inactive");
            case "DECEASED": return t("athena.ui.deceased");
        }
    };

    const formatPersonTypeLabel = (roles?: readonly PersonRole[]): string => {
        const safeRoles = roles ?? [];
        const patient = safeRoles.includes("PATIENT");
        const practitioner = safeRoles.includes("PRACTITIONER");
        if (patient && practitioner) return t("athena.ui.patientPractitioner");
        if (patient) return t("athena.ui.patient");
        if (practitioner) return t("athena.ui.practitioner");
        return t("athena.ui.person");
    };

    const formatLocalizedDate = (value?: string): string => {
        if (!value) return "--";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "--";
        return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
    };

    const [
        activeNavigation,
        setActiveNavigation
    ] = useState<NavigationKey>("athena");
    const [emsView, setEmsView] 
        =useState<"bas" | "contracts" | "resources">("bas");
    const [
        schedulingOpen,
        setSchedulingOpen
    ] = useState(false);

    const [
        search,
        setSearch
    ] = useState("");

    const [
        debouncedSearch,
        setDebouncedSearch
    ] = useState("");

    const [
        page,
        setPage
    ] = useState(1);

    const [
        result,
        setResult
    ] = useState<PersonListResponse>(
        emptyResult
    );

    const [
        loading,
        setLoading
    ] = useState(true);

    const [
        error,
        setError
    ] = useState<string | null>(
        null
    );

    const [
        summary,
        setSummary
    ] = useState<PersonSummaryResponse | null>(
        null
    );


    const [
        selectedListPerson,
        setSelectedListPerson
    ] = useState<PersonListItem | null>(
        null
    );

    const [
        selectedPerson,
        setSelectedPerson
    ] = useState<PersonDetail | null>(
        null
    );

    const [
        patientRecord,
        setPatientRecord
    ] = useState<PatientRecord | null>(null);

    const [
        patientEncounters,
        setPatientEncounters
    ] = useState<EncounterRecord[]>([]);

    const [
        selectedEncounter,
        setSelectedEncounter
    ] = useState<EncounterRecord | null>(null);

    const [
        patientClinicalView,
        setPatientClinicalView
    ] = useState<PatientClinicalView>("OVERVIEW");

    const [
        clinicalLoading,
        setClinicalLoading
    ] = useState(false);

    const [
        clinicalError,
        setClinicalError
    ] = useState<string | null>(null);

    const [
        detailLoading,
        setDetailLoading
    ] = useState(false);

    const [
        detailError,
        setDetailError
    ] = useState<string | null>(
        null
    );

    const [
        isEditingPerson,
        setIsEditingPerson
    ] = useState(false);

    const [
        isCreatingPerson,
        setIsCreatingPerson
    ] = useState(false);

    const [
        editForm,
        setEditForm
    ] = useState<PersonEditForm | null>(
        null
    );

    const [
        saveLoading,
        setSaveLoading
    ] = useState(false);

    const [
        saveError,
        setSaveError
    ] = useState<string | null>(
        null
    );

    const [
        saveSuccess,
        setSaveSuccess
    ] = useState<string | null>(
        null
    );

    const [
        facilityOptions,
        setFacilityOptions
    ] = useState<FacilityOption[]>([]);

    const [
        facilityAffiliations,
        setFacilityAffiliations
    ] = useState<PersonFacilityAffiliation[]>([]);

    const [
        facilityAffiliationEditForm,
        setFacilityAffiliationEditForm
    ] = useState<PersonFacilityAffiliationEditForm[]>([]);

    const [
        patientRegistrationOpen,
        setPatientRegistrationOpen
    ] = useState(false);

    const [
        hospitalStructureOpen,
        setHospitalStructureOpen
    ] = useState(false);

    const [
        censusBedBoardOpen,
        setCensusBedBoardOpen
    ] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(
            () => {
                setDebouncedSearch(
                    search.trim()
                );

                setPage(1);
            },
            300
        );

        return () => {
            window.clearTimeout(timer);
        };
    }, [search]);

    useEffect(() => {
        const controller =
            new AbortController();

        const loadPersons =
            async (): Promise<void> => {
                setLoading(true);
                setError(null);

                try {
                    const parameters =
                        new URLSearchParams({
                            page: String(page),
                            pageSize:
                                String(PAGE_SIZE)
                        });

                    if (debouncedSearch) {
                        parameters.set(
                            "search",
                            debouncedSearch
                        );
                    }

                    const response =
                        await fetch(
                            `/api/v1/his/persons?${parameters.toString()}`,
                            {
                                headers: {
                                    "x-tenant-id":
                                        tenantId
                                },
                                signal:
                                    controller.signal
                            }
                        );

                    if (!response.ok) {
                        let message =
                            `Unable to load persons (${response.status}).`;

                        try {
                            const body =
                                await response.json() as {
                                    error?: string;
                                };

                            if (body.error) {
                                message =
                                    body.error;
                            }
                        } catch {
                            // Keep the HTTP status message.
                        }

                        throw new Error(
                            message
                        );
                    }

                    const body =
                        await response.json() as
                            PersonListResponse;

                    const normalizedResult:
                        PersonListResponse = {
                            ...body,
                            items:
                                body.items.map(
                                    (
                                        person
                                    ) => ({
                                        ...person,
                                        roles:
                                            Array.isArray(
                                                person.roles
                                            )
                                                ? person.roles
                                                : []
                                    })
                                )
                        };

                    setResult(
                        normalizedResult
                    );
                } catch (loadError) {
                    if (
                        loadError instanceof DOMException &&
                        loadError.name ===
                            "AbortError"
                    ) {
                        return;
                    }

                    const message =
                        loadError instanceof Error
                            ? loadError.message
                            : "Unable to load persons.";

                    setError(message);
                    setResult(emptyResult);
                } finally {
                    if (
                        !controller.signal.aborted
                    ) {
                        setLoading(false);
                    }
                }
            };

        void loadPersons();

        return () => {
            controller.abort();
        };
    }, [
        page,
        debouncedSearch
    ]);

    useEffect(() => {
        const controller =
            new AbortController();

        const loadSummary =
            async (): Promise<void> => {
                try {
                    const response =
                        await fetch(
                            "/api/v1/his/persons/summary",
                            {
                                headers: {
                                    "x-tenant-id":
                                        tenantId
                                },
                                signal:
                                    controller.signal
                            }
                        );

                    if (!response.ok) {
                        throw new Error(
                            `Unable to load Person summary (${response.status}).`
                        );
                    }

                    const body =
                        await response.json() as
                            PersonSummaryResponse;

                    setSummary(body);
                } catch (
                    summaryError
                ) {
                    if (
                        summaryError instanceof
                            DOMException &&
                        summaryError.name ===
                            "AbortError"
                    ) {
                        return;
                    }

                    console.error(
                        "Unable to load Athena Person summary.",
                        summaryError
                    );

                    setSummary(null);
                }
            };

        void loadSummary();

        return () => {
            controller.abort();
        };
    }, []);

    const paginationItems =
        useMemo(
            () =>
                createPaginationItems(
                    result.page,
                    result.totalPages
                ),
            [
                result.page,
                result.totalPages
            ]
        );

    const handleNavigation = (
        key: NavigationKey
    ) => {
        setActiveNavigation(key);

        if (key === "athena") {
            setSchedulingOpen(true);
        }
    };

    const handlePageChange = (
        targetPage: number
    ) => {
        if (
            targetPage < 1 ||
            targetPage >
                result.totalPages ||
            targetPage === page
        ) {
            return;
        }

        setPage(targetPage);
    };

    const closePersonDetail = () => {
        setSelectedListPerson(null);
        setSelectedPerson(null);
        setDetailError(null);
        setDetailLoading(false);
        setIsEditingPerson(false);
        setIsCreatingPerson(false);
        setEditForm(null);
        setSaveLoading(false);
        setSaveError(null);
        setSaveSuccess(null);
        setFacilityOptions([]);
        setFacilityAffiliations([]);
        setFacilityAffiliationEditForm([]);
        setPatientRecord(null);
        setPatientEncounters([]);
        setSelectedEncounter(null);
        setPatientClinicalView("OVERVIEW");
        setClinicalLoading(false);
        setClinicalError(null);
    };

    const handleNewPerson = async (): Promise<void> => {
        const now = new Date().toISOString();

        const draftListPerson: PersonListItem = {
            id: "NEW",
            firstName: "New",
            lastName: "Person",
            status: "ACTIVE",
            roles: [],
            updatedAt: now
        };

        const draftPerson: PersonDetail = {
            id: "NEW",
            tenantId: tenantId,
            firstName: "",
            lastName: "",
            sex: "UNKNOWN",
            identifiers: [],
            addresses: [],
            status: "ACTIVE",
            createdAt: now,
            updatedAt: now,
            version: 0
        };

        setSelectedListPerson(draftListPerson);
        setSelectedPerson(draftPerson);
        setDetailError(null);
        setDetailLoading(true);
        setIsCreatingPerson(true);
        setIsEditingPerson(true);
        setEditForm(createPersonEditForm(draftPerson));
        setSaveLoading(false);
        setSaveError(null);
        setSaveSuccess(null);
        setFacilityOptions([]);
        setFacilityAffiliations([]);
        setFacilityAffiliationEditForm([]);

        try {
            const response = await fetch(
                "/api/v1/his/facilities/options",
                {
                    headers: {
                        "x-tenant-id": tenantId
                    }
                }
            );

            if (!response.ok) {
                throw new Error(
                    `Unable to load Facility options (${response.status}).`
                );
            }

            const body = await response.json() as FacilityOption[];
            setFacilityOptions(Array.isArray(body) ? body : []);
        } catch (loadError) {
            setDetailError(
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load Facility options."
            );
        } finally {
            setDetailLoading(false);
        }
    };

    const loadPatientClinicalContext = async (
        personId: string
    ): Promise<void> => {
        setClinicalLoading(true);
        setClinicalError(null);
        setPatientRecord(null);
        setPatientEncounters([]);
        setSelectedEncounter(null);

        const headers = {
            "x-tenant-id": tenantId
        };

        try {
            const patientResponse = await fetch(
                `/api/v1/his/patients/by-person/${encodeURIComponent(
                    personId
                )}`,
                { headers }
            );

            if (patientResponse.status === 404) {
                return;
            }

            if (!patientResponse.ok) {
                throw new Error(
                    `Unable to load Patient record (${patientResponse.status}).`
                );
            }

            const patient =
                await patientResponse.json() as PatientRecord;

            setPatientRecord(patient);

            const encountersResponse = await fetch(
                `/api/v1/his/patients/${encodeURIComponent(
                    patient.id
                )}/encounters`,
                { headers }
            );

            if (!encountersResponse.ok) {
                throw new Error(
                    `Unable to load encounters (${encountersResponse.status}).`
                );
            }

            const body =
                await encountersResponse.json() as EncounterListResponse;

            setPatientEncounters(
                Array.isArray(body.items)
                    ? body.items
                    : []
            );
        } catch (clinicalFailure) {
            setClinicalError(
                clinicalFailure instanceof Error
                    ? clinicalFailure.message
                    : "Unable to load Patient clinical context."
            );
        } finally {
            setClinicalLoading(false);
        }
    };

    const handleOpenPerson = async (
        person: PersonListItem
    ): Promise<void> => {
        setSelectedListPerson(person);
        setSelectedPerson(null);
        setDetailError(null);
        setDetailLoading(true);
        setIsEditingPerson(false);
        setIsCreatingPerson(false);
        setEditForm(null);
        setSaveLoading(false);
        setSaveError(null);
        setSaveSuccess(null);
        setFacilityOptions([]);
        setFacilityAffiliations([]);
        setFacilityAffiliationEditForm([]);
        setPatientRecord(null);
        setPatientEncounters([]);
        setSelectedEncounter(null);
        setPatientClinicalView("OVERVIEW");
        setClinicalError(null);

        const tenantHeaders = {
            "x-tenant-id":
                tenantId
        };

        void loadPatientClinicalContext(person.id);

        try {
            const [
                personResponse,
                facilitiesResponse,
                affiliationsResponse
            ] = await Promise.all([
                fetch(
                    `/api/v1/his/persons/${encodeURIComponent(
                        person.id
                    )}`,
                    {
                        headers:
                            tenantHeaders
                    }
                ),
                fetch(
                    "/api/v1/his/facilities/options",
                    {
                        headers:
                            tenantHeaders
                    }
                ),
                fetch(
                    `/api/v1/his/persons/${encodeURIComponent(
                        person.id
                    )}/facility-affiliations`,
                    {
                        headers:
                            tenantHeaders
                    }
                )
            ]);

            const responses = [
                {
                    response:
                        personResponse,
                    label:
                        "Person"
                },
                {
                    response:
                        facilitiesResponse,
                    label:
                        "Facility options"
                },
                {
                    response:
                        affiliationsResponse,
                    label:
                        "Facility affiliations"
                }
            ];

            for (const item of responses) {
                if (!item.response.ok) {
                    let message =
                        `Unable to load ${item.label} (${item.response.status}).`;

                    try {
                        const body =
                            await item.response.json() as {
                                error?: string;
                            };

                        if (body.error) {
                            message =
                                body.error;
                        }
                    } catch {
                        // Keep the HTTP status message.
                    }

                    throw new Error(
                        message
                    );
                }
            }

            const personBody =
                await personResponse.json() as
                    PersonDetail;

            const facilitiesBody =
                await facilitiesResponse.json() as
                    FacilityOption[];

            const affiliationsBody =
                await affiliationsResponse.json() as
                    PersonFacilityAffiliation[];

            const normalizedPerson:
                PersonDetail = {
                    ...personBody,
                    identifiers:
                        Array.isArray(
                            personBody.identifiers
                        )
                            ? personBody.identifiers
                            : [],
                    addresses:
                        Array.isArray(
                            personBody.addresses
                        )
                            ? personBody.addresses
                            : []
                };

            const normalizedOptions =
                Array.isArray(
                    facilitiesBody
                )
                    ? facilitiesBody
                    : [];

            const normalizedAffiliations =
                Array.isArray(
                    affiliationsBody
                )
                    ? affiliationsBody
                    : [];

            setSelectedPerson(
                normalizedPerson
            );

            setFacilityOptions(
                normalizedOptions
            );

            setFacilityAffiliations(
                normalizedAffiliations
            );

            setFacilityAffiliationEditForm(
                normalizedAffiliations.map(
                    (affiliation) => ({
                        facilityId:
                            affiliation.facilityId,
                        affiliationType:
                            affiliation.affiliationType,
                        isPrimary:
                            affiliation.isPrimary
                    })
                )
            );

            setEditForm(
                createPersonEditForm(
                    normalizedPerson
                )
            );
        } catch (loadError) {
            const message =
                loadError instanceof Error
                    ? loadError.message
                    : "Unable to load Person.";

            setDetailError(message);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleOpenScheduledEncounter = async (
        personId: string
    ): Promise<void> => {
        let person =
            result.items.find(
                (item) =>
                    item.id === personId
            );

        if (!person) {
            const response =
                await fetch(
                    `/api/v1/his/persons/${encodeURIComponent(
                        personId
                    )}`,
                    {
                        headers: {
                            "x-tenant-id":
                                tenantId
                        }
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `Unable to open Patient encounter (${response.status}).`
                );
            }

            const detail =
                await response.json() as PersonDetail;

            person = {
                id: detail.id,
                firstName: detail.firstName,
                middleName: detail.middleName,
                lastName: detail.lastName,
                preferredName: detail.preferredName,
                status: detail.status,
                roles: ["PATIENT"],
                updatedAt: detail.updatedAt
            };
        }

        await handleOpenPerson(person);
        setPatientClinicalView("ENCOUNTERS");
        setSchedulingOpen(false);
    };

    const handleStartEdit = () => {
        if (!selectedPerson) {
            return;
        }

        setEditForm(
            createPersonEditForm(
                selectedPerson
            )
        );

        setFacilityAffiliationEditForm(
            facilityAffiliations.map(
                (affiliation) => ({
                    facilityId:
                        affiliation.facilityId,
                    affiliationType:
                        affiliation.affiliationType,
                    isPrimary:
                        affiliation.isPrimary
                })
            )
        );

        setSaveError(null);
        setSaveSuccess(null);
        setIsEditingPerson(true);
    };

    const handleCancelEdit = () => {
        if (isCreatingPerson) {
            closePersonDetail();
            return;
        }

        if (selectedPerson) {
            setEditForm(
                createPersonEditForm(
                    selectedPerson
                )
            );
        }

        setFacilityAffiliationEditForm(
            facilityAffiliations.map(
                (affiliation) => ({
                    facilityId:
                        affiliation.facilityId,
                    affiliationType:
                        affiliation.affiliationType,
                    isPrimary:
                        affiliation.isPrimary
                })
            )
        );

        setSaveError(null);
        setSaveSuccess(null);
        setIsEditingPerson(false);
    };

    const handleEditField = (
        field: PersonScalarEditField,
        value: string
    ) => {
        setEditForm(
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    [field]:
                        value
                };
            }
        );
    };

    const handleIdentifierField = (
        index: number,
        field: keyof PersonIdentifierEditForm,
        value: string
    ) => {
        setEditForm(
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    identifiers:
                        current.identifiers.map(
                            (
                                identifier,
                                identifierIndex
                            ) =>
                                identifierIndex === index
                                    ? {
                                        ...identifier,
                                        [field]:
                                            value
                                    }
                                    : identifier
                        )
                };
            }
        );
    };

    const handleAddIdentifier = () => {
        setEditForm(
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    identifiers: [
                        ...current.identifiers,
                        {
                            system: "",
                            value: ""
                        }
                    ]
                };
            }
        );
    };

    const handleRemoveIdentifier = (
        index: number
    ) => {
        setEditForm(
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    identifiers:
                        current.identifiers.filter(
                            (
                                _identifier,
                                identifierIndex
                            ) =>
                                identifierIndex !== index
                        )
                };
            }
        );
    };

    const handleAddressField = (
        index: number,
        field: keyof PersonAddressEditForm,
        value: string
    ) => {
        setEditForm(
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    addresses:
                        current.addresses.map(
                            (
                                address,
                                addressIndex
                            ) =>
                                addressIndex === index
                                    ? {
                                        ...address,
                                        [field]:
                                            value
                                    }
                                    : address
                        )
                };
            }
        );
    };

    const handleAddAddress = () => {
        setEditForm(
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    addresses: [
                        ...current.addresses,
                        {
                            line1: "",
                            line2: "",
                            city: "",
                            provinceOrState: "",
                            postalCode: "",
                            country: ""
                        }
                    ]
                };
            }
        );
    };

    const handleRemoveAddress = (
        index: number
    ) => {
        setEditForm(
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    addresses:
                        current.addresses.filter(
                            (
                                _address,
                                addressIndex
                            ) =>
                                addressIndex !== index
                        )
                };
            }
        );
    };

    const handleAddFacilityAffiliation = () => {
        setFacilityAffiliationEditForm(
            (current) => [
                ...current,
                {
                    facilityId:
                        facilityOptions[0]?.id ??
                        "",
                    affiliationType:
                        "GENERAL",
                    isPrimary:
                        current.length === 0
                }
            ]
        );
    };

    const handleFacilityAffiliationField = (
        index: number,
        field:
            | "facilityId"
            | "affiliationType",
        value: string
    ) => {
        setFacilityAffiliationEditForm(
            (current) =>
                current.map(
                    (
                        affiliation,
                        affiliationIndex
                    ) =>
                        affiliationIndex ===
                        index
                            ? {
                                ...affiliation,
                                [field]:
                                    value
                            } as
                                PersonFacilityAffiliationEditForm
                            : affiliation
                )
        );
    };

    const handleFacilityPrimary = (
        index: number
    ) => {
        setFacilityAffiliationEditForm(
            (current) =>
                current.map(
                    (
                        affiliation,
                        affiliationIndex
                    ) => ({
                        ...affiliation,
                        isPrimary:
                            affiliationIndex ===
                            index
                    })
                )
        );
    };

    const handleRemoveFacilityAffiliation = (
        index: number
    ) => {
        setFacilityAffiliationEditForm(
            (current) => {
                const removed =
                    current[index];

                const next =
                    current.filter(
                        (
                            _affiliation,
                            affiliationIndex
                        ) =>
                            affiliationIndex !==
                            index
                    );

                if (
                    removed?.isPrimary &&
                    next.length > 0 &&
                    !next.some(
                        (affiliation) =>
                            affiliation.isPrimary
                    )
                ) {
                    return next.map(
                        (
                            affiliation,
                            affiliationIndex
                        ) => ({
                            ...affiliation,
                            isPrimary:
                                affiliationIndex ===
                                0
                        })
                    );
                }

                return next;
            }
        );
    };

    const handleSavePerson = async (): Promise<void> => {
        if (
            !selectedPerson ||
            !selectedListPerson ||
            !editForm
        ) {
            return;
        }

        const firstName =
            editForm.firstName.trim();

        const lastName =
            editForm.lastName.trim();

        if (
            !firstName ||
            !lastName
        ) {
            setSaveError(
                t("athena.ui.firstNameAndLastNameAreRequired")
            );
            return;
        }

        const identifiers =
            editForm.identifiers
                .map(
                    (identifier) => ({
                        system:
                            identifier.system.trim(),
                        value:
                            identifier.value.trim()
                    })
                )
                .filter(
                    (identifier) =>
                        identifier.system ||
                        identifier.value
                );

        if (
            identifiers.some(
                (identifier) =>
                    !identifier.system ||
                    !identifier.value
            )
        ) {
            setSaveError(
                t("athena.ui.everyIdentifierMustIncludeBothASystemAndAValue")
            );
            return;
        }

        const addresses =
            editForm.addresses
                .map(
                    (address) => ({
                        line1:
                            address.line1.trim(),
                        line2:
                            optionalValue(
                                address.line2
                            ),
                        city:
                            address.city.trim(),
                        provinceOrState:
                            optionalValue(
                                address.provinceOrState
                            ),
                        postalCode:
                            optionalValue(
                                address.postalCode
                            ),
                        country:
                            address.country.trim()
                    })
                )
                .filter(
                    (address) =>
                        address.line1 ||
                        address.line2 ||
                        address.city ||
                        address.provinceOrState ||
                        address.postalCode ||
                        address.country
                );

        if (
            addresses.some(
                (address) =>
                    !address.line1 ||
                    !address.city ||
                    !address.country
            )
        ) {
            setSaveError(
                t("athena.ui.everyAddressMustIncludeAddressLine1CityAndCountry")
            );
            return;
        }

        if (
            facilityAffiliationEditForm.some(
                (affiliation) =>
                    !affiliation.facilityId
            )
        ) {
            setSaveError(
                t("athena.ui.everyFacilityAffiliationMustSelectAFacility")
            );
            return;
        }

        const primaryCount =
            facilityAffiliationEditForm.filter(
                (affiliation) =>
                    affiliation.isPrimary
            ).length;

        if (primaryCount > 1) {
            setSaveError(
                t("athena.ui.onlyOneFacilityAffiliationCanBePrimary")
            );
            return;
        }

        const affiliationKeys =
            facilityAffiliationEditForm.map(
                (affiliation) =>
                    `${affiliation.facilityId}|${affiliation.affiliationType}`
            );

        if (
            new Set(
                affiliationKeys
            ).size !==
            affiliationKeys.length
        ) {
            setSaveError(
                t("athena.ui.theSameFacilityAndAffiliationTypeCannotBeAddedMoreThanOnce")
            );
            return;
        }

        setSaveLoading(true);
        setSaveError(null);
        setSaveSuccess(null);

        const contactInformation = {
            email:
                optionalValue(
                    editForm.email
                ),
            phone:
                optionalValue(
                    editForm.phone
                ),
            mobilePhone:
                optionalValue(
                    editForm.mobilePhone
                )
        };

        const payload = {
            firstName,
            middleName:
                optionalValue(
                    editForm.middleName
                ),
            lastName,
            preferredName:
                optionalValue(
                    editForm.preferredName
                ),
            dateOfBirth:
                editForm.dateOfBirth ||
                undefined,
            sex:
                editForm.sex,
            gender:
                optionalValue(
                    editForm.gender
                ),
            contactInformation,
            identifiers,
            addresses,
            ...(isCreatingPerson
                ? {}
                : { version: selectedPerson.version })
        };

        try {
            const response =
                await fetch(
                    isCreatingPerson
                        ? "/api/v1/his/persons"
                        : `/api/v1/his/persons/${encodeURIComponent(
                              selectedPerson.id
                          )}`,
                    {
                        method:
                            isCreatingPerson ? "POST" : "PUT",
                        headers: {
                            "Content-Type":
                                "application/json",
                            "x-tenant-id":
                                tenantId
                        },
                        body:
                            JSON.stringify(
                                payload
                            )
                    }
                );

            if (!response.ok) {
                let message =
                    `Unable to save Person (${response.status}).`;

                try {
                    const body =
                        await response.json() as {
                            error?: string;
                        };

                    if (body.error) {
                        message =
                            body.error;
                    }
                } catch {
                    // Keep the HTTP status message.
                }

                if (
                    response.status ===
                    409
                ) {
                    message =
                        "This Person was changed by another update. Close and reopen the record before trying again.";
                }

                throw new Error(
                    message
                );
            }

            const body =
                await response.json() as
                    PersonDetail;

            const normalizedPerson:
                PersonDetail = {
                    ...body,
                    identifiers:
                        Array.isArray(
                            body.identifiers
                        )
                            ? body.identifiers
                            : selectedPerson.identifiers,
                    addresses:
                        Array.isArray(
                            body.addresses
                        )
                            ? body.addresses
                            : selectedPerson.addresses
                };

            const affiliationResponse =
                await fetch(
                    `/api/v1/his/persons/${encodeURIComponent(
                        normalizedPerson.id
                    )}/facility-affiliations`,
                    {
                        method:
                            "PUT",
                        headers: {
                            "Content-Type":
                                "application/json",
                            "x-tenant-id":
                                tenantId
                        },
                        body:
                            JSON.stringify({
                                affiliations:
                                    facilityAffiliationEditForm
                            })
                    }
                );

            if (!affiliationResponse.ok) {
                let message =
                    `Unable to save Facility affiliations (${affiliationResponse.status}).`;

                try {
                    const errorBody =
                        await affiliationResponse.json() as {
                            error?: string;
                        };

                    if (errorBody.error) {
                        message =
                            errorBody.error;
                    }
                } catch {
                    // Keep the HTTP status message.
                }

                throw new Error(
                    message
                );
            }

            const savedAffiliations =
                await affiliationResponse.json() as
                    PersonFacilityAffiliation[];

            const normalizedAffiliations =
                Array.isArray(
                    savedAffiliations
                )
                    ? savedAffiliations
                    : [];

            setFacilityAffiliations(
                normalizedAffiliations
            );

            setFacilityAffiliationEditForm(
                normalizedAffiliations.map(
                    (affiliation) => ({
                        facilityId:
                            affiliation.facilityId,
                        affiliationType:
                            affiliation.affiliationType,
                        isPrimary:
                            affiliation.isPrimary
                    })
                )
            );

            const displayAffiliation =
                normalizedAffiliations.find(
                    (affiliation) =>
                        affiliation.isPrimary
                ) ??
                normalizedAffiliations[0];

            setSelectedPerson(
                normalizedPerson
            );

            const updatedListPerson:
                PersonListItem = {
                    ...(isCreatingPerson
                        ? {
                              id: normalizedPerson.id,
                              roles: [] as PersonRole[]
                          }
                        : selectedListPerson),
                    firstName:
                        normalizedPerson.firstName,
                    middleName:
                        normalizedPerson.middleName,
                    lastName:
                        normalizedPerson.lastName,
                    preferredName:
                        normalizedPerson.preferredName,
                    status:
                        normalizedPerson.status,
                    primaryFacilityId:
                        displayAffiliation
                            ?.facilityId,
                    primaryFacilityName:
                        displayAffiliation
                            ?.facilityName,
                    updatedAt:
                        normalizedPerson.updatedAt
                };

            setSelectedListPerson(
                updatedListPerson
            );

            if (isCreatingPerson) {
                setSummary((current) =>
                    current
                        ? {
                              ...current,
                              totalPersons:
                                  current.totalPersons + 1
                          }
                        : current
                );
            }

            setResult(
                (current) => ({
                    ...current,
                    total:
                        isCreatingPerson
                            ? current.total + 1
                            : current.total,
                    items:
                        isCreatingPerson
                            ? [
                                  updatedListPerson,
                                  ...current.items
                              ].slice(0, PAGE_SIZE)
                            : current.items.map(
                                  (person) =>
                                      person.id ===
                                      updatedListPerson.id
                                          ? {
                                                ...person,
                                                ...updatedListPerson
                                            }
                                          : person
                              )
                })
            );

            setEditForm(
                createPersonEditForm(
                    normalizedPerson
                )
            );

            setIsEditingPerson(false);
            setIsCreatingPerson(false);
            setSaveSuccess(
                isCreatingPerson
                    ? t("athena.ui.personCreatedSuccessfully")
                    : t("athena.ui.personAndFacilityAffiliationsUpdatedSuccessfully")
            );
        } catch (saveFailure) {
            const message =
                saveFailure instanceof Error
                    ? saveFailure.message
                    : "Unable to save Person.";

            setSaveError(message);
        } finally {
            setSaveLoading(false);
        }
    };

    const handleExport = () => {
        if (result.items.length === 0) {
            return;
        }

        const escapeCsvValue = (
            value: string
        ) =>
            `"${value.replace(
                /"/g,
                '""'
            )}"`;

        const headers = [
            "ID",
            t("athena.ui.name"),
            t("athena.ui.type"),
            t("athena.ui.identifier"),
            t("athena.ui.facility"),
            t("athena.ui.status"),
            "Last Updated"
        ];

        const rows =
            result.items.map(
                (person) => [
                    person.id,
                    formatPersonName(person),
                    formatPersonTypeLabel(
                        person.roles
                    ),
                    person.primaryIdentifier ??
                        "",
                    person.primaryFacilityName ??
                        "",
                    formatStatusLabel(
                        person.status
                    ),
                    formatLocalizedDate(
                        person.updatedAt
                    )
                ]
            );

        const csv = [
            headers
                .map(escapeCsvValue)
                .join(","),
            ...rows.map((row) =>
                row
                    .map(
                        escapeCsvValue
                    )
                    .join(",")
            )
        ].join("\r\n");

        const blob = new Blob(
            [
                "\uFEFF",
                csv
            ],
            {
                type:
                    "text/csv;charset=utf-8"
            }
        );

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        const date =
            new Date()
                .toISOString()
                .slice(0, 10);

        link.href = url;

        link.download =
            `athena-persons-${date}.csv`;

        document.body.appendChild(
            link
        );

        link.click();
        link.remove();

        URL.revokeObjectURL(url);
    };

    const showingStart =
        result.total === 0
            ? 0
            : (
                (result.page - 1) *
                result.pageSize
            ) + 1;

    const showingEnd =
        result.total === 0
            ? 0
            : Math.min(
                result.page *
                    result.pageSize,
                result.total
            );

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">
                        Athena
                    </div>

                    <div>
                        <div className="brand-name">
                            EIS
                        </div>

                        <div className="brand-subtitle">
                            {t("athena.ui.enterpriseIntelligenceSystem")}
                        </div>
                    </div>
                </div>

                <div className="workspace-selector">
                    <div className="workspace-label">
                        {t("athena.ui.workspace")}
                    </div>

                    <button
                        className="workspace-button"
                        type="button"
                    >
                        <span className="workspace-icon">
                            E
                        </span>

                        <span className="workspace-details">
                            <strong>
                                {t("athena.ui.enterprise")}
                            </strong>

                            <small>
                                {t("athena.ui.production")}
                            </small>
                        </span>

                        <span className="workspace-chevron">
                            â–¾
                        </span>
                    </button>
                </div>

                <nav className="sidebar-navigation">
                    <div className="navigation-section">
                        <div className="navigation-section-label">
                            {t("athena.ui.platform")}
                        </div>

                        {navigation.map(
                            (item) => (
                                <button
                                    key={
                                        item.key
                                    }
                                    type="button"
                                    className={`navigation-item ${
                                        activeNavigation ===
                                        item.key
                                            ? "active"
                                            : ""
                                    }`}
                                    onClick={() =>
                                        handleNavigation(
                                            item.key
                                        )
                                    }
                                >
                                    <span className="navigation-icon">
                                        {
                                            item.icon
                                        }
                                    </span>

                                    <span>
                                        {
                                            t(item.labelKey)
                                        }
                                    </span>
                                </button>
                            )
                        )}
                    </div>

                    <div className="navigation-section">
                        <div className="navigation-section-label">
                            {t("athena.ui.administration")}
                        </div>

                        {administrationNavigation.map(
                            (item) => (
                                <button
                                    key={
                                        item.key
                                    }
                                    type="button"
                                    className={`navigation-item ${
                                        activeNavigation ===
                                        item.key
                                            ? "active"
                                            : ""
                                    }`}
                                    onClick={() =>
                                        handleNavigation(
                                            item.key
                                        )
                                    }
                                >
                                    <span className="navigation-icon">
                                        {
                                            item.icon
                                        }
                                    </span>

                                    <span>
                                        {
                                            t(item.labelKey)
                                        }
                                    </span>
                                </button>
                            )
                        )}
                    </div>
                </nav>

                <div className="sidebar-footer">
                    <div className="system-status">
                        <span className="status-dot" />
                        <span>
                            {t("athena.ui.allSystemsOperational")}
                        </span>
                    </div>

                    <div className="user-profile">
                        <div className="user-avatar">
                            {identity.displayName
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map(part => part[0]?.toUpperCase() ?? "")
                                .join("") || "U"}
                        </div>

                        <div className="user-details">
                            <strong>
                                {identity.displayName || t("athena.ui.administrator")}
                            </strong>

                            <span>
                                {t("athena.ui.platformAdmin")}
                            </span>
                        </div>

                        <button
                            className="logout-button"
                            type="button"
                            onClick={logout}
                            aria-label={
                                identity.language === "es"
                                    ? "Cerrar sesiÃ³n"
                                    : "Sign out"
                            }
                            title={
                                identity.language === "es"
                                    ? "Cerrar sesiÃ³n"
                                    : "Sign out"
                            }
                        >
                            <span aria-hidden="true">â†ª</span>
                            <span>
                                {identity.language === "es"
                                    ? "Salir"
                                    : "Sign out"}
                            </span>
                        </button>
                    </div>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="breadcrumb">
                        <span>Ruby</span>

                        <span className="breadcrumb-separator">
                            /
                        </span>

                        <span>{activeNavigation === "ems" ? "EMS" : "Athena"}</span>

                        <span className="breadcrumb-separator">
                            /
                        </span>

                        <strong>
                            {activeNavigation === "ems"
                                ? emsView === "contracts"
                                    ? "Energy Contracts"
                                    : emsView === "resources"
                                        ? "Tradespeople & Resources"
                                        : "BAS"
                                : t("athena.ui.persons")}
                        </strong>
                    </div>

                    <div className="topbar-actions">
                        <LanguageSelector />

                    </div>
                </header>

                {activeNavigation === "ems" ? (
                    <div className="content">
                        {emsView === "contracts" ? (
                            <EnergyContracts
                                onBack={() => setEmsView("bas")}
                                tenantId={tenantId}
                            />
                        ) : emsView === "resources" ? (
                            <TradeResources
                                tenantId={tenantId}
                            />
                        ) : (
                            <>
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "flex-end",
                                        gap: "10px",
                                        marginBottom: "14px"
                                    }}
                                >
                                    <button
                                        className="secondary-button"
                                        type="button"
                                        onClick={() =>
                                            setEmsView("contracts")
                                        }
                                    >
                                        Energy Contracts
                                    </button>

                                    <button
                                        className="secondary-button"
                                        type="button"
                                        onClick={() =>
                                            setEmsView("resources")
                                        }
                                    >
                                        Tradespeople &amp; Resources
                                    </button>
                                </div>

                                <BasDashboard
                                    tenantId={tenantId}
                                    siteId={
                                        import.meta.env.VITE_BAS_SITE_ID ??
                                        "f304a249-4bfd-4bae-908b-42f6f843770f"
                                    }
                                    language={identity.language}
                                />
                            </>
                        )}
                    </div>
                ) : activeNavigation === "administration" ? (
                    <div className="content">
                        <AdministrationWorkspace />
                    </div>
                ) : (
                    <div className="content">
                    <div className="page-header">
                        <div>
                            <div className="page-eyebrow">
                                {t("athena.ui.athenaHOSPITALINFORMATIONSYSTEM")}
                            </div>

                            <h1>
                                {t("athena.ui.persons")}
                            </h1>

                            <p>
                                {t("athena.ui.managePeopleAcrossYourAthenaEnvironment")}
                            </p>
                        </div>

                        <div className="page-header-actions">
                            <button
                                className="secondary-button"
                                type="button"
                                onClick={
                                    handleExport
                                }
                                disabled={
                                    result.items
                                        .length === 0
                                }
                            >
                                {t("athena.ui.export")}
                            </button>

                            <button
                                className="secondary-button"
                                type="button"
                                onClick={() =>
                                    setHospitalStructureOpen(true)
                                }
                            >
                                {t("athena.ui.hospitalStructure")}
                            </button>

                            <button
                                className="secondary-button"
                                type="button"
                                onClick={() =>
                                    setCensusBedBoardOpen(true)
                                }
                            >
                                Census / Bed Board
                            </button>

                            <button
                                className="secondary-button"
                                type="button"
                                onClick={() =>
                                    setPatientRegistrationOpen(true)
                                }
                            >
                                {t("athena.ui.registerPatient")}
                            </button>

                            <button
                                className="primary-button"
                                type="button"
                                onClick={() =>
                                    void handleNewPerson()
                                }
                            >
                                {t("athena.ui.newPerson")}
                            </button>
                        </div>
                    </div>

                    <section className="summary-grid">
                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    {t("athena.ui.totalPersons")}
                                </span>
                            </div>

                            <div className="summary-value">
                                {summary
                                    ? summary.totalPersons.toLocaleString(locale)
                                    : "--"}
                            </div>

                            <div className="summary-footer">
                                <span>
                                    {t("athena.ui.live")}
                                </span>

                                <span>
                                    {t("athena.ui.fromAthena")}
                                </span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    {t("athena.ui.patients")}
                                </span>
                            </div>

                            <div className="summary-value">
                                {summary
                                    ? summary.totalPatients.toLocaleString(locale)
                                    : "--"}
                            </div>

                            <div className="summary-footer">
                                <span>
                                    {t("athena.ui.live")}
                                </span>

                                <span>
                                    {t("athena.ui.fromAthena")}
                                </span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    {t("athena.ui.practitioners")}
                                </span>
                            </div>

                            <div className="summary-value">
                                {summary
                                    ? summary.totalPractitioners.toLocaleString(locale)
                                    : "--"}
                            </div>

                            <div className="summary-footer">
                                <span>
                                    {t("athena.ui.live")}
                                </span>

                                <span>
                                    {t("athena.ui.fromAthena")}
                                </span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    {t("athena.ui.activeToday")}
                                </span>
                            </div>

                            <div className="summary-value">
                                --
                            </div>

                            <div className="summary-footer">
                                <span>
                                    {t("athena.ui.awaiting")}
                                </span>

                                <span>
                                    {t("athena.ui.activityMetrics")}
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className="content-card">
                        <div className="content-card-header">
                            <div>
                                <h2>
                                    {t("athena.ui.allPersons")}
                                </h2>

                                <p>
                                    {t("athena.ui.searchAndManagePersonsRegisteredInAthena")}
                                </p>
                            </div>

                            <div className="table-actions">
                                <div className="search-box">
                                    <span className="search-icon" aria-hidden="true">
                                        âŒ•
                                    </span>

                                    <input
                                        type="search"
                                        placeholder={t("athena.ui.searchPersons")}
                                        value={
                                            search
                                        }
                                        onChange={(
                                            event
                                        ) =>
                                            setSearch(
                                                event
                                                    .target
                                                    .value
                                            )
                                        }
                                    />
                                </div>


                            </div>
                        </div>

                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>
                                            {t("athena.ui.person")}
                                        </th>

                                        <th>
                                            {t("athena.ui.type")}
                                        </th>

                                        <th>
                                            {t("athena.ui.identifier")}
                                        </th>

                                        <th>
                                            {t("athena.ui.facility")}
                                        </th>

                                        <th>
                                            {t("athena.ui.status")}
                                        </th>

                                        <th>
                                            {t("athena.ui.lastUpdated")}
                                        </th>

                                        <th aria-label="Actions" />
                                    </tr>
                                </thead>

                                <tbody>
                                    {!loading &&
                                        !error &&
                                        result.items.map(
                                            (
                                                person
                                            ) => (
                                                <tr
                                                    key={
                                                        person.id
                                                    }
                                                >
                                                    <td>
                                                        <div className="person-cell">
                                                            <div className="person-avatar">
                                                                {getPersonInitials(
                                                                    person
                                                                )}
                                                            </div>

                                                            <div>
                                                                <strong>
                                                                    {formatPersonName(
                                                                        person
                                                                    )}
                                                                </strong>

                                                                <span>
                                                                    ID:{" "}
                                                                    {
                                                                        person.id
                                                                    }
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <span className="type-badge">
                                                            {formatPersonTypeLabel(
                                                                person.roles
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        <span className="identifier">
                                                            {person.primaryIdentifier ??
                                                                "--"}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        {person.primaryFacilityName ??
                                                            "--"}
                                                    </td>

                                                    <td>
                                                        <span
                                                            className={`status-badge ${
                                                                person.status ===
                                                                "ACTIVE"
                                                                    ? "active"
                                                                    : "inactive"
                                                            }`}
                                                        >
                                                            <span />

                                                            {formatStatusLabel(
                                                                person.status
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        {formatLocalizedDate(
                                                            person.updatedAt
                                                        )}
                                                    </td>

                                                    <td>
                                                        <button
                                                            className="row-action"
                                                            type="button"
                                                            aria-label={`View ${formatPersonName(
                                                                person
                                                            )}`}
                                                            title={t("athena.ui.viewPerson")}
                                                            onClick={() =>
                                                                void handleOpenPerson(
                                                                    person
                                                                )
                                                            }
                                                        >
                                                            {t("athena.ui.viewPerson")}
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        )}

                                    {loading && (
                                        <tr>
                                            <td
                                                colSpan={
                                                    7
                                                }
                                                className="empty-state"
                                            >
                                                {t("athena.ui.loadingPersons")}
                                            </td>
                                        </tr>
                                    )}

                                    {!loading &&
                                        error && (
                                            <tr>
                                                <td
                                                    colSpan={
                                                        7
                                                    }
                                                    className="empty-state"
                                                >
                                                    {
                                                        error
                                                    }
                                                </td>
                                            </tr>
                                        )}

                                    {!loading &&
                                        !error &&
                                        result.items
                                            .length ===
                                            0 && (
                                            <tr>
                                                <td
                                                    colSpan={
                                                        7
                                                    }
                                                    className="empty-state"
                                                >
                                                    {debouncedSearch
                                                        ? "No persons match your search."
                                                        : "No persons are registered in Athena."}
                                                </td>
                                            </tr>
                                        )}
                                </tbody>
                            </table>
                        </div>

                        <div className="pagination">
                            <div className="pagination-info">
                                {t("athena.ui.showing")}{" "}
                                <strong>
                                    {
                                        showingStart
                                    }
                                    -
                                    {
                                        showingEnd
                                    }
                                </strong>{" "}
                                {t("athena.ui.of")}{" "}
                                <strong>
                                    {result.total.toLocaleString(locale)}
                                </strong>{" "}
                                {t("athena.ui.personsApp")}
                            </div>

                            <div className="pagination-controls">
                                <button
                                    type="button"
                                    disabled={
                                        loading ||
                                        result.page <=
                                            1
                                    }
                                    aria-label="Previous page"
                                    onClick={() =>
                                        handlePageChange(
                                            result.page -
                                                1
                                        )
                                    }
                                >
                                    &lt;
                                </button>

                                {paginationItems.map(
                                    (
                                        item,
                                        index
                                    ) => {
                                        if (
                                            item ===
                                            "ellipsis"
                                        ) {
                                            return (
                                                <span
                                                    key={`ellipsis-${index}`}
                                                >
                                                    ...
                                                </span>
                                            );
                                        }

                                        return (
                                            <button
                                                key={
                                                    item
                                                }
                                                type="button"
                                                className={
                                                    item ===
                                                    result.page
                                                        ? "pagination-current"
                                                        : undefined
                                                }
                                                onClick={() =>
                                                    handlePageChange(
                                                        item
                                                    )
                                                }
                                                disabled={
                                                    loading
                                                }
                                            >
                                                {
                                                    item
                                                }
                                            </button>
                                        );
                                    }
                                )}

                                <button
                                    type="button"
                                    disabled={
                                        loading ||
                                        result.totalPages ===
                                            0 ||
                                        result.page >=
                                            result.totalPages
                                    }
                                    aria-label="Next page"
                                    onClick={() =>
                                        handlePageChange(
                                            result.page +
                                                1
                                        )
                                    }
                                >
                                    &gt;
                                </button>
                            </div>
                        </div> 
                    </section>
                </div>
                )}
            </main>

            {schedulingOpen && (
                <SchedulingPanel
                    tenantId={tenantId}
                    onClose={() =>
                        setSchedulingOpen(false)
                    }
                    onOpenEncounter={
                        handleOpenScheduledEncounter
                    }
                />
            )}

            {hospitalStructureOpen && (
                <HospitalStructurePanel
                    tenantId={tenantId}
                    onClose={() =>
                        setHospitalStructureOpen(false)
                    }
                />
            )}

            {censusBedBoardOpen && (
                <CensusBedBoardPanel
                    tenantId={tenantId}
                    onClose={() =>
                        setCensusBedBoardOpen(false)
                    }
                />
            )}

            {patientRegistrationOpen && (
                <PatientRegistrationPanel
                    tenantId={tenantId}
                    onClose={() =>
                        setPatientRegistrationOpen(false)
                    }
                />
            )}

            {selectedListPerson && (
                <div
                    style={
                        detailStyles.backdrop
                    }
                    role="presentation"
                    onMouseDown={(
                        event
                    ) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            closePersonDetail();
                        }
                    }}
                >
                    <aside
                        style={
                            detailStyles.drawer
                        }
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Person details for ${formatPersonName(
                            selectedListPerson
                        )}`}
                    >
                        <div
                            style={
                                detailStyles.drawerHeader
                            }
                        >
                            <div>
                                <p
                                    style={
                                        detailStyles.eyebrow
                                    }
                                >
                                    {isCreatingPerson
                                        ? t("athena.ui.athenaNEWPERSON")
                                        : t("athena.ui.athenaPERSON")}
                                </p>

                                <h2
                                    style={
                                        detailStyles.title
                                    }
                                >
                                    {isCreatingPerson
                                        ? t("athena.ui.createPerson")
                                        : selectedPerson
                                        ? formatDetailName(
                                              selectedPerson
                                          )
                                        : formatPersonName(
                                              selectedListPerson
                                          )}
                                </h2>

                                <p
                                    style={
                                        detailStyles.subtitle
                                    }
                                >
                                    {isCreatingPerson
                                        ? t("athena.ui.enterThePersonDetailsBelow")
                                        : selectedListPerson.id}
                                </p>
                            </div>

                            <div
                                style={
                                    detailStyles.headerActions
                                }
                            >
                                {selectedPerson &&
                                    !isEditingPerson && (
                                        <button
                                            type="button"
                                            style={
                                                detailStyles.editButton
                                            }
                                            onClick={
                                                handleStartEdit
                                            }
                                        >
                                            {t("athena.ui.edit")}
                                        </button>
                                    )}

                                <button
                                    type="button"
                                    aria-label={t("athena.ui.closePersonDetails")}
                                    title={t("athena.ui.close")}
                                    style={
                                        detailStyles.closeButton
                                    }
                                    onClick={
                                        closePersonDetail
                                    }
                                    disabled={
                                        saveLoading
                                    }
                                >
                                    X
                                </button>
                            </div>
                        </div>

                        {!isCreatingPerson && (
                        <div
                            style={
                                detailStyles.badgeRow
                            }
                        >
                            <span
                                style={
                                    detailStyles.badge
                                }
                            >
                                {formatPersonTypeLabel(
                                    selectedListPerson.roles
                                )}
                            </span>

                            <span
                                style={
                                    detailStyles.badge
                                }
                            >
                                {formatStatusLabel(
                                    selectedListPerson.status
                                )}
                            </span>

                            <span
                                style={
                                    detailStyles.badge
                                }
                            >
                                {selectedListPerson
                                    .primaryFacilityName ??
                                    t("athena.ui.noCurrentFacility")}
                            </span>
                        </div>
                        )}

                        {saveSuccess && (
                            <div
                                style={
                                    detailStyles.success
                                }
                            >
                                {
                                    saveSuccess
                                }
                            </div>
                        )}

                        {saveError && (
                            <div
                                style={
                                    detailStyles.error
                                }
                            >
                                {
                                    saveError
                                }
                            </div>
                        )}

                        {isEditingPerson &&
                            editForm && (
                                <div
                                    style={
                                        detailStyles.actionRow
                                    }
                                >
                                    <button
                                        type="button"
                                        style={
                                            detailStyles.cancelButton
                                        }
                                        onClick={
                                            handleCancelEdit
                                        }
                                        disabled={
                                            saveLoading
                                        }
                                    >
                                        {t("athena.ui.cancel")}
                                    </button>

                                    <button
                                        type="button"
                                        style={
                                            detailStyles.saveButton
                                        }
                                        onClick={() =>
                                            void handleSavePerson()
                                        }
                                        disabled={
                                            saveLoading
                                        }
                                    >
                                        {saveLoading
                                            ? "Saving..."
                                            : isCreatingPerson
                                            ? "Create Person"
                                            : "Save changes"}
                                    </button>
                                </div>
                            )}

                        {detailLoading && (
                            <div
                                style={
                                    detailStyles.message
                                }
                            >
                                Loading Person details...
                            </div>
                        )}

                        {!detailLoading &&
                            detailError && (
                                <div
                                    style={
                                        detailStyles.error
                                    }
                                >
                                    {
                                        detailError
                                    }
                                </div>
                            )}

                        {!detailLoading &&
                            !detailError &&
                            selectedPerson && (
                                <>
                                    {!isCreatingPerson && (
                                        <section
                                            style={
                                                detailStyles.section
                                            }
                                        >
                                            <h3
                                                style={
                                                    detailStyles.sectionTitle
                                                }
                                            >
                                                Patient Clinical
                                            </h3>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 8,
                                                    flexWrap: "wrap",
                                                    marginBottom: 14
                                                }}
                                            >
                                                {(
                                                    [
                                                        ["OVERVIEW", "Overview"],
                                                        ["ENCOUNTERS", "Encounters"],
                                                        ["ADT", "ADT / Bed Management"]
                                                    ] as const
                                                ).map(([key, label]) => (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() =>
                                                            setPatientClinicalView(
                                                                key
                                                            )
                                                        }
                                                        disabled={
                                                            key !== "OVERVIEW" &&
                                                            !patientRecord
                                                        }
                                                        style={{
                                                            ...detailStyles.editButton,
                                                            opacity:
                                                                key !== "OVERVIEW" &&
                                                                !patientRecord
                                                                    ? 0.5
                                                                    : 1,
                                                            background:
                                                                patientClinicalView === key
                                                                    ? "#eef4ff"
                                                                    : undefined
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>

                                            {clinicalLoading && (
                                                <div style={detailStyles.message}>
                                                    Loading Patient clinical information...
                                                </div>
                                            )}

                                            {clinicalError && (
                                                <div style={detailStyles.error}>
                                                    {clinicalError}
                                                </div>
                                            )}

                                            {!clinicalLoading &&
                                                !clinicalError &&
                                                !patientRecord && (
                                                    <div style={detailStyles.value}>
                                                        This Person does not have a Patient record.
                                                    </div>
                                                )}

                                            {patientRecord &&
                                                patientClinicalView === "OVERVIEW" && (
                                                    <div style={detailStyles.grid}>
                                                        <div style={detailStyles.field}>
                                                            <span style={detailStyles.label}>
                                                                Patient number
                                                            </span>
                                                            <div style={detailStyles.value}>
                                                                {patientRecord.patientNumber}
                                                            </div>
                                                        </div>
                                                        <div style={detailStyles.field}>
                                                            <span style={detailStyles.label}>
                                                                MRN
                                                            </span>
                                                            <div style={detailStyles.value}>
                                                                {patientRecord.medicalRecordNumber}
                                                            </div>
                                                        </div>
                                                        <div style={detailStyles.field}>
                                                            <span style={detailStyles.label}>
                                                                Patient status
                                                            </span>
                                                            <div style={detailStyles.value}>
                                                                {patientRecord.status}
                                                            </div>
                                                        </div>
                                                        <div style={detailStyles.field}>
                                                            <span style={detailStyles.label}>
                                                                Encounters
                                                            </span>
                                                            <div style={detailStyles.value}>
                                                                {patientEncounters.length}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                            {patientRecord &&
                                                patientClinicalView === "ENCOUNTERS" && (
                                                    <EncounterManagement
                                                        tenantId={tenantId}
                                                        patientId={patientRecord.id}
                                                        encounters={patientEncounters}
                                                        facilities={facilityOptions}
                                                        onRefresh={() =>
                                                            loadPatientClinicalContext(
                                                                selectedPerson.id
                                                            )
                                                        }
                                                        onOpenAdt={(encounter) => {
                                                            setSelectedEncounter(
                                                                encounter
                                                            );
                                                            setPatientClinicalView(
                                                                "ADT"
                                                            );
                                                        }}
                                                    />
                                                )}

                                            {patientRecord &&
                                                patientClinicalView === "ADT" && (
                                                    <div>
                                                        {!selectedEncounter ? (
                                                            <div style={detailStyles.value}>
                                                                Select an encounter from the Encounters tab to open Patient ADT.
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div
                                                                    style={{
                                                                        display: "flex",
                                                                        justifyContent: "space-between",
                                                                        gap: 12,
                                                                        alignItems: "center",
                                                                        marginBottom: 12
                                                                    }}
                                                                >
                                                                    <div>
                                                                        <strong>
                                                                            {selectedEncounter.encounterNumber}
                                                                        </strong>
                                                                        <div>
                                                                            {selectedEncounter.encounterType
                                                                                .replaceAll("_", " ")}{" "}
                                                                            Â· {selectedEncounter.status
                                                                                .replaceAll("_", " ")}
                                                                        </div>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        style={detailStyles.editButton}
                                                                        onClick={() =>
                                                                            setPatientClinicalView(
                                                                                "ENCOUNTERS"
                                                                            )
                                                                        }
                                                                    >
                                                                        Change encounter
                                                                    </button>
                                                                </div>

                                                                <AdtWorkspace
                                                                    tenantId={tenantId}
                                                                    encounter={{
                                                                        id: selectedEncounter.id,
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
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                        </section>
                                    )}

                                    <section
                                        style={
                                            detailStyles.section
                                        }
                                    >
                                        <h3
                                            style={
                                                detailStyles.sectionTitle
                                            }
                                        >
                                            {t("athena.ui.demographics")}
                                        </h3>

                                        {isEditingPerson &&
                                        editForm ? (
                                            <div
                                                style={
                                                    detailStyles.grid
                                                }
                                            >
                                                {[
                                                    [
                                                        "First name",
                                                        "firstName"
                                                    ],
                                                    [
                                                        "Middle name",
                                                        "middleName"
                                                    ],
                                                    [
                                                        "Last name",
                                                        "lastName"
                                                    ],
                                                    [
                                                        "Preferred name",
                                                        "preferredName"
                                                    ],
                                                    [
                                                        "Gender",
                                                        "gender"
                                                    ]
                                                ].map(
                                                    ([
                                                        label,
                                                        field
                                                    ]) => (
                                                        <label
                                                            key={
                                                                field
                                                            }
                                                            style={
                                                                detailStyles.field
                                                            }
                                                        >
                                                            <span
                                                                style={
                                                                    detailStyles.label
                                                                }
                                                            >
                                                                {
                                                                    label
                                                                }
                                                            </span>

                                                            <input
                                                                style={
                                                                    detailStyles.input
                                                                }
                                                                value={
                                                                    editForm[
                                                                        field as PersonScalarEditField
                                                                    ]
                                                                }
                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    handleEditField(
                                                                        field as PersonScalarEditField,
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                }
                                                            />
                                                        </label>
                                                    )
                                                )}

                                                <label
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Date of birth
                                                    </span>

                                                    <input
                                                        type="date"
                                                        style={
                                                            detailStyles.input
                                                        }
                                                        value={
                                                            editForm.dateOfBirth
                                                        }
                                                        onChange={(
                                                            event
                                                        ) =>
                                                            handleEditField(
                                                                "dateOfBirth",
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                    />
                                                </label>

                                                <label
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Sex
                                                    </span>

                                                    <select
                                                        style={
                                                            detailStyles.input
                                                        }
                                                        value={
                                                            editForm.sex
                                                        }
                                                        onChange={(
                                                            event
                                                        ) =>
                                                            handleEditField(
                                                                "sex",
                                                                event
                                                                    .target
                                                                    .value
                                                            )
                                                        }
                                                    >
                                                        <option value="UNKNOWN">
                                                            Unknown
                                                        </option>
                                                        <option value="MALE">
                                                            Male
                                                        </option>
                                                        <option value="FEMALE">
                                                            Female
                                                        </option>
                                                        <option value="INTERSEX">
                                                            Intersex
                                                        </option>
                                                        <option value="OTHER">
                                                            Other
                                                        </option>
                                                    </select>
                                                </label>
                                            </div>
                                        ) : (
                                            <div
                                                style={
                                                    detailStyles.grid
                                                }
                                            >
                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        First name
                                                    </span>
                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {
                                                            selectedPerson.firstName
                                                        }
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Middle name
                                                    </span>
                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedPerson.middleName ??
                                                            "--"}
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Last name
                                                    </span>
                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {
                                                            selectedPerson.lastName
                                                        }
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Preferred name
                                                    </span>
                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedPerson.preferredName ??
                                                            "--"}
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Date of birth
                                                    </span>
                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {formatLocalizedDate(
                                                            selectedPerson.dateOfBirth
                                                        )}
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Sex
                                                    </span>
                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {
                                                            selectedPerson.sex
                                                        }
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Gender
                                                    </span>
                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedPerson.gender ??
                                                            "--"}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </section>

                                    <section
                                        style={
                                            detailStyles.section
                                        }
                                    >
                                        <div
                                            style={
                                                detailStyles.collectionHeader
                                            }
                                        >
                                            <h3
                                                style={{
                                                    ...detailStyles.sectionTitle,
                                                    marginBottom: 0
                                                }}
                                            >
                                                {t("athena.ui.identifiers")}
                                            </h3>

                                            {isEditingPerson &&
                                                editForm && (
                                                    <button
                                                        type="button"
                                                        style={
                                                            detailStyles.addButton
                                                        }
                                                        onClick={
                                                            handleAddIdentifier
                                                        }
                                                        disabled={
                                                            saveLoading
                                                        }
                                                    >
                                                        + Add identifier
                                                    </button>
                                                )}
                                        </div>

                                        {isEditingPerson &&
                                        editForm ? (
                                            editForm.identifiers.length >
                                            0 ? (
                                                editForm.identifiers.map(
                                                    (
                                                        identifier,
                                                        index
                                                    ) => (
                                                        <div
                                                            key={`identifier-${index}`}
                                                            style={
                                                                detailStyles.collectionCard
                                                            }
                                                        >
                                                            <div
                                                                style={
                                                                    detailStyles.collectionHeader
                                                                }
                                                            >
                                                                <span
                                                                    style={
                                                                        detailStyles.collectionTitle
                                                                    }
                                                                >
                                                                    Identifier{" "}
                                                                    {index +
                                                                        1}
                                                                </span>

                                                                <button
                                                                    type="button"
                                                                    style={
                                                                        detailStyles.removeButton
                                                                    }
                                                                    onClick={() =>
                                                                        handleRemoveIdentifier(
                                                                            index
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        saveLoading
                                                                    }
                                                                >
                                                                    {t("athena.ui.remove")}
                                                                </button>
                                                            </div>

                                                            <div
                                                                style={
                                                                    detailStyles.grid
                                                                }
                                                            >
                                                                <label
                                                                    style={
                                                                        detailStyles.field
                                                                    }
                                                                >
                                                                    <span
                                                                        style={
                                                                            detailStyles.label
                                                                        }
                                                                    >
                                                                        System
                                                                    </span>

                                                                    <input
                                                                        style={
                                                                            detailStyles.input
                                                                        }
                                                                        placeholder="MRN"
                                                                        value={
                                                                            identifier.system
                                                                        }
                                                                        onChange={(
                                                                            event
                                                                        ) =>
                                                                            handleIdentifierField(
                                                                                index,
                                                                                "system",
                                                                                event
                                                                                    .target
                                                                                    .value
                                                                            )
                                                                        }
                                                                    />
                                                                </label>

                                                                <label
                                                                    style={
                                                                        detailStyles.field
                                                                    }
                                                                >
                                                                    <span
                                                                        style={
                                                                            detailStyles.label
                                                                        }
                                                                    >
                                                                        Value
                                                                    </span>

                                                                    <input
                                                                        style={
                                                                            detailStyles.input
                                                                        }
                                                                        placeholder="Identifier value"
                                                                        value={
                                                                            identifier.value
                                                                        }
                                                                        onChange={(
                                                                            event
                                                                        ) =>
                                                                            handleIdentifierField(
                                                                                index,
                                                                                "value",
                                                                                event
                                                                                    .target
                                                                                    .value
                                                                            )
                                                                        }
                                                                    />
                                                                </label>
                                                            </div>
                                                        </div>
                                                    )
                                                )
                                            ) : (
                                                <div
                                                    style={
                                                        detailStyles.emptyEditor
                                                    }
                                                >
                                                    No identifiers. Use
                                                    &quot;+ Add identifier&quot;
                                                    to add one.
                                                </div>
                                            )
                                        ) : selectedPerson
                                            .identifiers
                                            .length >
                                        0 ? (
                                            <ul
                                                style={
                                                    detailStyles.list
                                                }
                                            >
                                                {selectedPerson.identifiers.map(
                                                    (
                                                        identifier,
                                                        index
                                                    ) => (
                                                        <li
                                                            key={`${identifier.system}-${identifier.value}-${index}`}
                                                        >
                                                            <strong>
                                                                {
                                                                    identifier.system
                                                                }
                                                            </strong>
                                                            {": "}
                                                            {
                                                                identifier.value
                                                            }
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        ) : (
                                            <div
                                                style={
                                                    detailStyles.value
                                                }
                                            >
                                                No identifiers recorded.
                                            </div>
                                        )}
                                    </section>

                                    <section
                                        style={
                                            detailStyles.section
                                        }
                                    >
                                        <h3
                                            style={
                                                detailStyles.sectionTitle
                                            }
                                        >
                                            {t("athena.ui.contactInformation")}
                                        </h3>

                                        {isEditingPerson &&
                                        editForm ? (
                                            <div
                                                style={
                                                    detailStyles.grid
                                                }
                                            >
                                                {[
                                                    [
                                                        "Email",
                                                        "email",
                                                        "email"
                                                    ],
                                                    [
                                                        "Phone",
                                                        "phone",
                                                        "tel"
                                                    ],
                                                    [
                                                        "Mobile",
                                                        "mobilePhone",
                                                        "tel"
                                                    ]
                                                ].map(
                                                    ([
                                                        label,
                                                        field,
                                                        type
                                                    ]) => (
                                                        <label
                                                            key={
                                                                field
                                                            }
                                                            style={
                                                                detailStyles.field
                                                            }
                                                        >
                                                            <span
                                                                style={
                                                                    detailStyles.label
                                                                }
                                                            >
                                                                {
                                                                    label
                                                                }
                                                            </span>

                                                            <input
                                                                type={
                                                                    type
                                                                }
                                                                style={
                                                                    detailStyles.input
                                                                }
                                                                value={
                                                                    editForm[
                                                                        field as PersonScalarEditField
                                                                    ]
                                                                }
                                                                onChange={(
                                                                    event
                                                                ) =>
                                                                    handleEditField(
                                                                        field as PersonScalarEditField,
                                                                        event
                                                                            .target
                                                                            .value
                                                                    )
                                                                }
                                                            />
                                                        </label>
                                                    )
                                                )}

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        {t("athena.ui.facility")}
                                                    </span>

                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedListPerson
                                                            .primaryFacilityName ??
                                                            "--"}
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                style={
                                                    detailStyles.grid
                                                }
                                            >
                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Email
                                                    </span>

                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedPerson
                                                            .contactInformation
                                                            ?.email ??
                                                            "--"}
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Phone
                                                    </span>

                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedPerson
                                                            .contactInformation
                                                            ?.phone ??
                                                            "--"}
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        Mobile
                                                    </span>

                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedPerson
                                                            .contactInformation
                                                            ?.mobilePhone ??
                                                            "--"}
                                                    </div>
                                                </div>

                                                <div
                                                    style={
                                                        detailStyles.field
                                                    }
                                                >
                                                    <span
                                                        style={
                                                            detailStyles.label
                                                        }
                                                    >
                                                        {t("athena.ui.facility")}
                                                    </span>

                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedListPerson
                                                            .primaryFacilityName ??
                                                            "--"}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </section>

                                    <section
                                        style={
                                            detailStyles.section
                                        }
                                    >
                                        <div
                                            style={
                                                detailStyles.collectionHeader
                                            }
                                        >
                                            <h3
                                                style={{
                                                    ...detailStyles.sectionTitle,
                                                    marginBottom: 0
                                                }}
                                            >
                                                {t("athena.ui.facilityAffiliations")}
                                            </h3>

                                            {isEditingPerson && (
                                                <button
                                                    type="button"
                                                    style={
                                                        detailStyles.addButton
                                                    }
                                                    onClick={
                                                        handleAddFacilityAffiliation
                                                    }
                                                    disabled={
                                                        saveLoading ||
                                                        facilityOptions.length ===
                                                            0
                                                    }
                                                >
                                                    + Add affiliation
                                                </button>
                                            )}
                                        </div>

                                        {isEditingPerson ? (
                                            <>
                                                {facilityAffiliationEditForm
                                                    .length ===
                                                    0 && (
                                                    <div
                                                        style={
                                                            detailStyles.emptyEditor
                                                        }
                                                    >
                                                        No current Facility affiliations.
                                                    </div>
                                                )}

                                                {facilityAffiliationEditForm.map(
                                                    (
                                                        affiliation,
                                                        index
                                                    ) => (
                                                        <div
                                                            key={
                                                                `${affiliation.facilityId}-${affiliation.affiliationType}-${index}`
                                                            }
                                                            style={
                                                                detailStyles.collectionCard
                                                            }
                                                        >
                                                            <div
                                                                style={
                                                                    detailStyles.grid
                                                                }
                                                            >
                                                                <label
                                                                    style={
                                                                        detailStyles.field
                                                                    }
                                                                >
                                                                    <span
                                                                        style={
                                                                            detailStyles.label
                                                                        }
                                                                    >
                                                                        {t("athena.ui.facility")}
                                                                    </span>

                                                                    <select
                                                                        style={
                                                                            detailStyles.select
                                                                        }
                                                                        value={
                                                                            affiliation.facilityId
                                                                        }
                                                                        onChange={(
                                                                            event
                                                                        ) =>
                                                                            handleFacilityAffiliationField(
                                                                                index,
                                                                                "facilityId",
                                                                                event.target.value
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            saveLoading
                                                                        }
                                                                    >
                                                                        <option value="">
                                                                            Select Facility
                                                                        </option>

                                                                        {facilityOptions.map(
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
                                                                                    {facility.name} ({facility.code})
                                                                                </option>
                                                                            )
                                                                        )}
                                                                    </select>
                                                                </label>

                                                                <label
                                                                    style={
                                                                        detailStyles.field
                                                                    }
                                                                >
                                                                    <span
                                                                        style={
                                                                            detailStyles.label
                                                                        }
                                                                    >
                                                                        Affiliation Type
                                                                    </span>

                                                                    <select
                                                                        style={
                                                                            detailStyles.select
                                                                        }
                                                                        value={
                                                                            affiliation.affiliationType
                                                                        }
                                                                        onChange={(
                                                                            event
                                                                        ) =>
                                                                            handleFacilityAffiliationField(
                                                                                index,
                                                                                "affiliationType",
                                                                                event.target.value
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            saveLoading
                                                                        }
                                                                    >
                                                                        <option value="PATIENT_CARE">
                                                                            Patient Care
                                                                        </option>
                                                                        <option value="PRACTITIONER_ASSIGNMENT">
                                                                            Practitioner Assignment
                                                                        </option>
                                                                        <option value="GENERAL">
                                                                            General
                                                                        </option>
                                                                    </select>
                                                                </label>
                                                            </div>

                                                            <div
                                                                style={{
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "center",
                                                                    justifyContent:
                                                                        "space-between",
                                                                    gap:
                                                                        "16px",
                                                                    marginTop:
                                                                        "12px"
                                                                }}
                                                            >
                                                                <label
                                                                    style={
                                                                        detailStyles.checkboxRow
                                                                    }
                                                                >
                                                                    <input
                                                                        type="radio"
                                                                        name="primary-facility-affiliation"
                                                                        checked={
                                                                            affiliation.isPrimary
                                                                        }
                                                                        onChange={() =>
                                                                            handleFacilityPrimary(
                                                                                index
                                                                            )
                                                                        }
                                                                        disabled={
                                                                            saveLoading
                                                                        }
                                                                    />
                                                                    Primary Facility
                                                                </label>

                                                                <button
                                                                    type="button"
                                                                    style={
                                                                        detailStyles.removeButton
                                                                    }
                                                                    onClick={() =>
                                                                        handleRemoveFacilityAffiliation(
                                                                            index
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        saveLoading
                                                                    }
                                                                >
                                                                    {t("athena.ui.remove")}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                )}

                                                {facilityOptions.length ===
                                                    0 && (
                                                    <div
                                                        style={
                                                            detailStyles.emptyEditor
                                                        }
                                                    >
                                                        No active Facilities are available for this tenant.
                                                    </div>
                                                )}
                                            </>
                                        ) : facilityAffiliations.length >
                                            0 ? (
                                            facilityAffiliations.map(
                                                (
                                                    affiliation
                                                ) => (
                                                    <div
                                                        key={
                                                            affiliation.id
                                                        }
                                                        style={
                                                            detailStyles.collectionCard
                                                        }
                                                    >
                                                        <div
                                                            style={{
                                                                display:
                                                                    "flex",
                                                                alignItems:
                                                                    "flex-start",
                                                                justifyContent:
                                                                    "space-between",
                                                                gap:
                                                                    "16px"
                                                            }}
                                                        >
                                                            <div>
                                                                <div
                                                                    style={
                                                                        detailStyles.collectionTitle
                                                                    }
                                                                >
                                                                    {
                                                                        affiliation.facilityName
                                                                    }
                                                                </div>
                                                                <div
                                                                    style={{
                                                                        ...detailStyles.value,
                                                                        marginTop:
                                                                            "4px"
                                                                    }}
                                                                >
                                                                    {affiliation.affiliationType ===
                                                                    "PATIENT_CARE"
                                                                        ? "Patient Care"
                                                                        : affiliation.affiliationType ===
                                                                          "PRACTITIONER_ASSIGNMENT"
                                                                        ? "Practitioner Assignment"
                                                                        : "General"}
                                                                    {" - "}
                                                                    {
                                                                        affiliation.facilityCode
                                                                    }
                                                                </div>
                                                            </div>

                                                            {affiliation.isPrimary && (
                                                                <span
                                                                    style={
                                                                        detailStyles.badge
                                                                    }
                                                                >
                                                                    Primary
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            )
                                        ) : (
                                            <div
                                                style={
                                                    detailStyles.value
                                                }
                                            >
                                                No current Facility affiliations.
                                            </div>
                                        )}
                                    </section>

                                    <section
                                        style={
                                            detailStyles.section
                                        }
                                    >
                                        <div
                                            style={
                                                detailStyles.collectionHeader
                                            }
                                        >
                                            <h3
                                                style={{
                                                    ...detailStyles.sectionTitle,
                                                    marginBottom: 0
                                                }}
                                            >
                                                {t("athena.ui.addresses")}
                                            </h3>

                                            {isEditingPerson &&
                                                editForm && (
                                                    <button
                                                        type="button"
                                                        style={
                                                            detailStyles.addButton
                                                        }
                                                        onClick={
                                                            handleAddAddress
                                                        }
                                                        disabled={
                                                            saveLoading
                                                        }
                                                    >
                                                        + Add address
                                                    </button>
                                                )}
                                        </div>

                                        {isEditingPerson &&
                                        editForm ? (
                                            editForm.addresses.length >
                                            0 ? (
                                                editForm.addresses.map(
                                                    (
                                                        address,
                                                        index
                                                    ) => (
                                                        <div
                                                            key={`address-${index}`}
                                                            style={
                                                                detailStyles.collectionCard
                                                            }
                                                        >
                                                            <div
                                                                style={
                                                                    detailStyles.collectionHeader
                                                                }
                                                            >
                                                                <span
                                                                    style={
                                                                        detailStyles.collectionTitle
                                                                    }
                                                                >
                                                                    Address{" "}
                                                                    {index +
                                                                        1}
                                                                </span>

                                                                <button
                                                                    type="button"
                                                                    style={
                                                                        detailStyles.removeButton
                                                                    }
                                                                    onClick={() =>
                                                                        handleRemoveAddress(
                                                                            index
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        saveLoading
                                                                    }
                                                                >
                                                                    {t("athena.ui.remove")}
                                                                </button>
                                                            </div>

                                                            <div
                                                                style={
                                                                    detailStyles.grid
                                                                }
                                                            >
                                                                {[
                                                                    [
                                                                        "Address line 1",
                                                                        "line1"
                                                                    ],
                                                                    [
                                                                        "Address line 2",
                                                                        "line2"
                                                                    ],
                                                                    [
                                                                        "City",
                                                                        "city"
                                                                    ],
                                                                    [
                                                                        "Province / State",
                                                                        "provinceOrState"
                                                                    ],
                                                                    [
                                                                        "Postal code",
                                                                        "postalCode"
                                                                    ],
                                                                    [
                                                                        "Country",
                                                                        "country"
                                                                    ]
                                                                ].map(
                                                                    ([
                                                                        label,
                                                                        field
                                                                    ]) => (
                                                                        <label
                                                                            key={
                                                                                field
                                                                            }
                                                                            style={
                                                                                detailStyles.field
                                                                            }
                                                                        >
                                                                            <span
                                                                                style={
                                                                                    detailStyles.label
                                                                                }
                                                                            >
                                                                                {
                                                                                    label
                                                                                }
                                                                            </span>

                                                                            <input
                                                                                style={
                                                                                    detailStyles.input
                                                                                }
                                                                                value={
                                                                                    address[
                                                                                        field as keyof PersonAddressEditForm
                                                                                    ]
                                                                                }
                                                                                onChange={(
                                                                                    event
                                                                                ) =>
                                                                                    handleAddressField(
                                                                                        index,
                                                                                        field as keyof PersonAddressEditForm,
                                                                                        event
                                                                                            .target
                                                                                            .value
                                                                                    )
                                                                                }
                                                                            />
                                                                        </label>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                    )
                                                )
                                            ) : (
                                                <div
                                                    style={
                                                        detailStyles.emptyEditor
                                                    }
                                                >
                                                    No addresses. Use
                                                    &quot;+ Add address&quot;
                                                    to add one.
                                                </div>
                                            )
                                        ) : selectedPerson
                                            .addresses
                                            .length >
                                        0 ? (
                                            <ul
                                                style={
                                                    detailStyles.list
                                                }
                                            >
                                                {selectedPerson.addresses.map(
                                                    (
                                                        address,
                                                        index
                                                    ) => (
                                                        <li
                                                            key={`${address.line1}-${index}`}
                                                        >
                                                            {formatAddress(
                                                                address
                                                            )}
                                                        </li>
                                                    )
                                                )}
                                            </ul>
                                        ) : (
                                            <div
                                                style={
                                                    detailStyles.value
                                                }
                                            >
                                                {t("athena.ui.noAddressesRecorded")}
                                            </div>
                                        )}
                                    </section>

                                    {!isCreatingPerson && (
                                    <section
                                        style={
                                            detailStyles.section
                                        }
                                    >
                                        <h3
                                            style={
                                                detailStyles.sectionTitle
                                            }
                                        >
                                            {t("athena.ui.recordInformation")}
                                        </h3>

                                        <div
                                            style={
                                                detailStyles.grid
                                            }
                                        >
                                            <div
                                                style={
                                                    detailStyles.field
                                                }
                                            >
                                                <span
                                                    style={
                                                        detailStyles.label
                                                    }
                                                >
                                                    {t("athena.ui.roles")}
                                                </span>

                                                <div
                                                    style={
                                                        detailStyles.value
                                                    }
                                                >
                                                    {formatPersonTypeLabel(
                                                        selectedListPerson.roles
                                                    )}
                                                </div>
                                            </div>

                                            <div
                                                style={
                                                    detailStyles.field
                                                }
                                            >
                                                <span
                                                    style={
                                                        detailStyles.label
                                                    }
                                                >
                                                    {t("athena.ui.version")}
                                                </span>

                                                <div
                                                    style={
                                                        detailStyles.value
                                                    }
                                                >
                                                    {
                                                        selectedPerson.version
                                                    }
                                                </div>
                                            </div>

                                            <div
                                                style={
                                                    detailStyles.field
                                                }
                                            >
                                                <span
                                                    style={
                                                        detailStyles.label
                                                    }
                                                >
                                                    {t("athena.ui.created")}
                                                </span>

                                                <div
                                                    style={
                                                        detailStyles.value
                                                    }
                                                >
                                                    {formatLocalizedDate(
                                                        selectedPerson
                                                            .createdAt
                                                    )}
                                                </div>
                                            </div>

                                            <div
                                                style={
                                                    detailStyles.field
                                                }
                                            >
                                                <span
                                                    style={
                                                        detailStyles.label
                                                    }
                                                >
                                                    {t("athena.ui.lastUpdatedApp")}
                                                </span>

                                                <div
                                                    style={
                                                        detailStyles.value
                                                    }
                                                >
                                                    {formatLocalizedDate(
                                                        selectedPerson
                                                            .updatedAt
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                    )}
                                </>
                            )}
                    </aside>
                </div>
            )}
        </div>
    );
}

export default App;


