import {
    useEffect,
    useMemo,
    useState
} from "react";

import type {
    CSSProperties
} from "react";

type NavigationItem = {
    label: string;
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
    { label: "Dashboard", icon: "⌂" },
    { label: "Athena", icon: "✚" },
    { label: "Compliance", icon: "✓" },
    { label: "Workflow", icon: "↗" },
    { label: "Security", icon: "◈" },
    { label: "AI Hub", icon: "✦" }
];

const administrationNavigation: NavigationItem[] = [
    { label: "Administration", icon: "⚙" },
    { label: "Audit", icon: "◷" }
];

/*
 * Temporary development tenant.
 *
 * This will eventually come from EIS authentication /
 * tenant context rather than being defined by Athena.
 *
 * It is intentionally a syntactically valid UUID so the
 * HIS tenant middleware accepts development requests.
 */
const DEVELOPMENT_TENANT_ID =
    "11111111-1111-4111-8111-111111111111";

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
        return "—";
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
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
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
    const [
        activeNavigation,
        setActiveNavigation
    ] = useState("Athena");

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
                                        DEVELOPMENT_TENANT_ID
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
                                        DEVELOPMENT_TENANT_ID
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
        label: string
    ) => {
        setActiveNavigation(label);
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
        setEditForm(null);
        setSaveLoading(false);
        setSaveError(null);
        setSaveSuccess(null);
        setFacilityOptions([]);
        setFacilityAffiliations([]);
        setFacilityAffiliationEditForm([]);
    };

    const handleOpenPerson = async (
        person: PersonListItem
    ): Promise<void> => {
        setSelectedListPerson(person);
        setSelectedPerson(null);
        setDetailError(null);
        setDetailLoading(true);
        setIsEditingPerson(false);
        setEditForm(null);
        setSaveLoading(false);
        setSaveError(null);
        setSaveSuccess(null);
        setFacilityOptions([]);
        setFacilityAffiliations([]);
        setFacilityAffiliationEditForm([]);

        const tenantHeaders = {
            "x-tenant-id":
                DEVELOPMENT_TENANT_ID
        };

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
                "First name and last name are required."
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
                "Every identifier must include both a system and a value."
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
                "Every address must include address line 1, city, and country."
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
                "Every Facility affiliation must select a Facility."
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
                "Only one Facility affiliation can be primary."
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
                "The same Facility and affiliation type cannot be added more than once."
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
            version:
                selectedPerson.version
        };

        try {
            const response =
                await fetch(
                    `/api/v1/his/persons/${encodeURIComponent(
                        selectedPerson.id
                    )}`,
                    {
                        method:
                            "PUT",
                        headers: {
                            "Content-Type":
                                "application/json",
                            "x-tenant-id":
                                DEVELOPMENT_TENANT_ID
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
                        selectedPerson.id
                    )}/facility-affiliations`,
                    {
                        method:
                            "PUT",
                        headers: {
                            "Content-Type":
                                "application/json",
                            "x-tenant-id":
                                DEVELOPMENT_TENANT_ID
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
                    ...selectedListPerson,
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

            setResult(
                (current) => ({
                    ...current,
                    items:
                        current.items.map(
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
            setSaveSuccess(
                "Person and Facility affiliations updated successfully."
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
            "Name",
            "Type",
            "Identifier",
            "Facility",
            "Status",
            "Last Updated"
        ];

        const rows =
            result.items.map(
                (person) => [
                    person.id,
                    formatPersonName(person),
                    formatPersonType(
                        person.roles
                    ),
                    person.primaryIdentifier ??
                        "",
                    person.primaryFacilityName ??
                        "",
                    formatStatus(
                        person.status
                    ),
                    formatUpdatedDate(
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
                            Enterprise Intelligence System
                        </div>
                    </div>
                </div>

                <div className="workspace-selector">
                    <div className="workspace-label">
                        WORKSPACE
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
                                Enterprise
                            </strong>

                            <small>
                                Production
                            </small>
                        </span>

                        <span className="workspace-chevron">
                            ⌄
                        </span>
                    </button>
                </div>

                <nav className="sidebar-navigation">
                    <div className="navigation-section">
                        <div className="navigation-section-label">
                            PLATFORM
                        </div>

                        {navigation.map(
                            (item) => (
                                <button
                                    key={
                                        item.label
                                    }
                                    type="button"
                                    className={`navigation-item ${
                                        activeNavigation ===
                                        item.label
                                            ? "active"
                                            : ""
                                    }`}
                                    onClick={() =>
                                        handleNavigation(
                                            item.label
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
                                            item.label
                                        }
                                    </span>
                                </button>
                            )
                        )}
                    </div>

                    <div className="navigation-section">
                        <div className="navigation-section-label">
                            ADMINISTRATION
                        </div>

                        {administrationNavigation.map(
                            (item) => (
                                <button
                                    key={
                                        item.label
                                    }
                                    type="button"
                                    className={`navigation-item ${
                                        activeNavigation ===
                                        item.label
                                            ? "active"
                                            : ""
                                    }`}
                                    onClick={() =>
                                        handleNavigation(
                                            item.label
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
                                            item.label
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
                            All systems operational
                        </span>
                    </div>

                    <div className="user-profile">
                        <div className="user-avatar">
                            PH
                        </div>

                        <div className="user-details">
                            <strong>
                                Administrator
                            </strong>

                            <span>
                                Platform Admin
                            </span>
                        </div>

                        <button
                            className="user-menu-button"
                            type="button"
                            aria-label="User menu"
                        >
                            ⋮
                        </button>
                    </div>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="breadcrumb">
                        <span>EIS</span>

                        <span className="breadcrumb-separator">
                            /
                        </span>

                        <span>Athena</span>

                        <span className="breadcrumb-separator">
                            /
                        </span>

                        <strong>
                            Persons
                        </strong>
                    </div>

                    <div className="topbar-actions">
                        <button
                            className="topbar-button"
                            type="button"
                            aria-label="Notifications"
                        >
                            ♢
                            <span className="notification-indicator" />
                        </button>

                        <button
                            className="topbar-button"
                            type="button"
                            aria-label="Help"
                        >
                            ?
                        </button>
                    </div>
                </header>

                <div className="content">
                    <div className="page-header">
                        <div>
                            <div className="page-eyebrow">
                                ATHENA · HOSPITAL INFORMATION SYSTEM
                            </div>

                            <h1>
                                Persons
                            </h1>

                            <p>
                                Manage people across your Athena
                                environment.
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
                                Export
                            </button>

                            <button
                                className="primary-button"
                                type="button"
                            >
                                + New Person
                            </button>
                        </div>
                    </div>

                    <section className="summary-grid">
                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    Total Persons
                                </span>

                                <span className="summary-icon">
                                    ◎
                                </span>
                            </div>

                            <div className="summary-value">
                                {summary
                                    ? summary.totalPersons.toLocaleString()
                                    : "—"}
                            </div>

                            <div className="summary-footer">
                                <span>
                                    Live
                                </span>

                                <span>
                                    from Athena
                                </span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    Patients
                                </span>

                                <span className="summary-icon">
                                    ♙
                                </span>
                            </div>

                            <div className="summary-value">
                                {summary
                                    ? summary.totalPatients.toLocaleString()
                                    : "—"}
                            </div>

                            <div className="summary-footer">
                                <span>
                                    Live
                                </span>

                                <span>
                                    from Athena
                                </span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    Practitioners
                                </span>

                                <span className="summary-icon">
                                    ✚
                                </span>
                            </div>

                            <div className="summary-value">
                                {summary
                                    ? summary.totalPractitioners.toLocaleString()
                                    : "—"}
                            </div>

                            <div className="summary-footer">
                                <span>
                                    Live
                                </span>

                                <span>
                                    from Athena
                                </span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-card-header">
                                <span>
                                    Active Today
                                </span>

                                <span className="summary-icon">
                                    ◉
                                </span>
                            </div>

                            <div className="summary-value">
                                —
                            </div>

                            <div className="summary-footer">
                                <span>
                                    Awaiting
                                </span>

                                <span>
                                    activity metrics
                                </span>
                            </div>
                        </div>
                    </section>

                    <section className="content-card">
                        <div className="content-card-header">
                            <div>
                                <h2>
                                    All Persons
                                </h2>

                                <p>
                                    Search and manage persons registered
                                    in Athena.
                                </p>
                            </div>

                            <div className="table-actions">
                                <div className="search-box">
                                    <span className="search-icon">
                                        ⌕
                                    </span>

                                    <input
                                        type="search"
                                        placeholder="Search persons..."
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

                                <button
                                    className="filter-button"
                                    type="button"
                                >
                                    ☷
                                    <span>
                                        Filter
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>
                                            Person
                                        </th>

                                        <th>
                                            Type
                                        </th>

                                        <th>
                                            Identifier
                                        </th>

                                        <th>
                                            Facility
                                        </th>

                                        <th>
                                            Status
                                        </th>

                                        <th>
                                            Last Updated
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
                                                            {formatPersonType(
                                                                person.roles
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        <span className="identifier">
                                                            {person.primaryIdentifier ??
                                                                "—"}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        {person.primaryFacilityName ??
                                                            "—"}
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

                                                            {formatStatus(
                                                                person.status
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td>
                                                        {formatUpdatedDate(
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
                                                            title="View Person"
                                                            onClick={() =>
                                                                void handleOpenPerson(
                                                                    person
                                                                )
                                                            }
                                                        >
                                                            ⋮
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
                                                Loading persons...
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
                                Showing{" "}
                                <strong>
                                    {
                                        showingStart
                                    }
                                    -
                                    {
                                        showingEnd
                                    }
                                </strong>{" "}
                                of{" "}
                                <strong>
                                    {result.total.toLocaleString()}
                                </strong>{" "}
                                persons
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
                                    ‹
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
                                    ›
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            </main>

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
                                    ATHENA · PERSON
                                </p>

                                <h2
                                    style={
                                        detailStyles.title
                                    }
                                >
                                    {selectedPerson
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
                                    {
                                        selectedListPerson.id
                                    }
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
                                            Edit
                                        </button>
                                    )}

                                <button
                                    type="button"
                                    aria-label="Close Person details"
                                    title="Close"
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
                                    ×
                                </button>
                            </div>
                        </div>

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
                                {formatPersonType(
                                    selectedListPerson.roles
                                )}
                            </span>

                            <span
                                style={
                                    detailStyles.badge
                                }
                            >
                                {formatStatus(
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
                                    "No current facility"}
                            </span>
                        </div>

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
                                        Cancel
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
                                            Demographics
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
                                                            "—"}
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
                                                            "—"}
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
                                                        {formatOptionalDate(
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
                                                            "—"}
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
                                                Identifiers
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
                                                                    Remove
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
                                            Contact information
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
                                                        Facility
                                                    </span>

                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedListPerson
                                                            .primaryFacilityName ??
                                                            "—"}
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
                                                            "—"}
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
                                                            "—"}
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
                                                            "—"}
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
                                                        Facility
                                                    </span>

                                                    <div
                                                        style={
                                                            detailStyles.value
                                                        }
                                                    >
                                                        {selectedListPerson
                                                            .primaryFacilityName ??
                                                            "—"}
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
                                                Facility Affiliations
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
                                                                        Facility
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
                                                                    Remove
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
                                                                    {" · "}
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
                                                Addresses
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
                                                                    Remove
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
                                                No addresses recorded.
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
                                            Record information
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
                                                    Roles
                                                </span>

                                                <div
                                                    style={
                                                        detailStyles.value
                                                    }
                                                >
                                                    {formatPersonType(
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
                                                    Version
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
                                                    Created
                                                </span>

                                                <div
                                                    style={
                                                        detailStyles.value
                                                    }
                                                >
                                                    {formatOptionalDate(
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
                                                    Last updated
                                                </span>

                                                <div
                                                    style={
                                                        detailStyles.value
                                                    }
                                                >
                                                    {formatOptionalDate(
                                                        selectedPerson
                                                            .updatedAt
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </>
                            )}
                    </aside>
                </div>
            )}
        </div>
    );
}

export default App;
