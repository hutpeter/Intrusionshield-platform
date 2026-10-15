import {
    useCallback,
    useEffect,
    useState
} from "react";


export type AdministrationTab =
    | "overview"
    | "clients"
    | "users"
    | "products"
    | "services"
    | "telemetry-policies"
    | "audit";


type AdministrationTabDefinition = {
    key: AdministrationTab;
    label: string;
};


type ServiceStatus =
    | "healthy"
    | "degraded"
    | "down";


type RubyService = {
    id: string;
    name: string;
    category: "platform" | "product";
    status: ServiceStatus;
    host: string;
    port: number;
    healthPath: string;
    responseTimeMs: number | null;
    lastCheckedAt: string;
    message?: string;
};


type ServiceHealthResponse = {
    status: "healthy" | "degraded";

    summary: {
        total: number;
        healthy: number;
        degraded: number;
        down: number;
    };

    services: RubyService[];
    checkedAt: string;
};


const tabs: AdministrationTabDefinition[] = [
    {
        key: "overview",
        label: "Overview"
    },
    {
        key: "clients",
        label: "Clients & Tenants"
    },
    {
        key: "users",
        label: "Users"
    },
    {
        key: "products",
        label: "Products & Licensing"
    },
    {
        key: "services",
        label: "Services"
    },
    {
        key: "telemetry-policies",
        label: "Telemetry Policies"
    },
    {
        key: "audit",
        label: "Audit"
    }
];


export function AdministrationWorkspace() {
    const [activeTab, setActiveTab] =
        useState<AdministrationTab>(
            "overview"
        );

    return (
        <div className="administration-workspace">
            <div className="page-header">
                <div>
                    <div className="page-eyebrow">
                        Ruby Platform Administration
                    </div>

                    <h1>Administration</h1>

                    <p>
                        Manage Ruby clients, users, products,
                        platform services and operational policies.
                    </p>
                </div>
            </div>

            <div
                className="administration-tabs"
                role="tablist"
                aria-label="Ruby administration"
            >
                {tabs.map(
                    (tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            aria-selected={
                                activeTab ===
                                tab.key
                            }
                            className={
                                `administration-tab ${
                                    activeTab === tab.key
                                        ? "active"
                                        : ""
                                }`
                            }
                            onClick={
                                () =>
                                    setActiveTab(
                                        tab.key
                                    )
                            }
                        >
                            {tab.label}
                        </button>
                    )
                )}
            </div>

            <div
                className="administration-tab-content"
                role="tabpanel"
            >
                <AdministrationTabContent
                    activeTab={activeTab}
                />
            </div>
        </div>
    );
}


function AdministrationTabContent({
    activeTab
}: {
    activeTab: AdministrationTab;
}) {
    switch (activeTab) {
        case "overview":
            return (
                <>
                    <h2>
                        Ruby Platform Overview
                    </h2>

                    <p>
                        Platform administration and operational
                        information will be available here.
                    </p>
                </>
            );

        case "clients":
            return (
                <>
                    <h2>
                        Clients &amp; Tenants
                    </h2>

                    <p>
                        Client onboarding and tenant management
                        will be available here.
                    </p>
                </>
            );

        case "users":
            return (
                <>
                    <h2>Users</h2>

                    <p>
                        Tenant and platform user administration
                        will be available here.
                    </p>
                </>
            );

        case "products":
            return (
                <>
                    <h2>
                        Products &amp; Licensing
                    </h2>

                    <p>
                        Product assignments, licensing and
                        entitlements will be available here.
                    </p>
                </>
            );

        case "services":
            return <ServicesPanel />;

        case "telemetry-policies":
            return (
                <>
                    <h2>
                        Telemetry Policies
                    </h2>

                    <p>
                        Telemetry persistence and lifecycle policy
                        administration will be available here.
                    </p>
                </>
            );

        case "audit":
            return (
                <>
                    <h2>Audit</h2>

                    <p>
                        Ruby platform administrative and operational
                        audit history will be available here.
                    </p>
                </>
            );
    }
}
function ServicesPanel() {
    const [data, setData] =
        useState<ServiceHealthResponse | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    const [startingServiceId, setStartingServiceId] =
        useState<string | null>(null);

    const loadServices =
        useCallback(async () => {
            setLoading(true);
            setError(null);

            try {
                const response =
                    await fetch(
                        "/api/v1/platform/services"
                    );

                if (!response.ok) {
                    throw new Error(
                        `Service health request failed with HTTP ${response.status}.`
                    );
                }

                const result =
                    await response.json() as
                        ServiceHealthResponse;

                setData(result);

            } catch (loadError) {
                setError(
                    loadError instanceof Error
                        ? loadError.message
                        : "Unable to load Ruby service health."
                );

            } finally {
                setLoading(false);
            }
        }, []);

    const startService =
        useCallback(
            async (
                service: RubyService
            ) => {
                const confirmed =
                    window.confirm(
                        `Start ${service.name}?`
                    );

                if (!confirmed) {
                    return;
                }

                setStartingServiceId(
                    service.id
                );

                setError(null);

                try {
                    const response =
                        await fetch(
                            `/api/v1/platform/services/${service.id}/start`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type":
                                        "application/json"
                                }
                            }
                        );

                    if (!response.ok) {
                        const body =
                            await response.json()
                                .catch(
                                    () => null
                                );

                        throw new Error(
                            body?.message ??
                            `Unable to start ${service.name}.`
                        );
                    }

                    /*
                     * The Platform Operations API returns once
                     * the process has been launched. Give the
                     * service a short period to initialize before
                     * refreshing its health state.
                     */
                    await new Promise<void>(
                        (resolve) => {
                            window.setTimeout(
                                resolve,
                                2000
                            );
                        }
                    );

                    await loadServices();

                } catch (startError) {
                    const message =
                        startError instanceof Error
                            ? startError.message
                            : `Unable to start ${service.name}.`;

                    setError(message);

                    window.alert(
                        message
                    );

                } finally {
                    setStartingServiceId(
                        null
                    );
                }
            },
            [
                loadServices
            ]
        );

    useEffect(
        () => {
            void loadServices();
        },
        [loadServices]
    );

    return (
        <div className="ruby-services-panel">
            <div className="ruby-services-heading">
                <div>
                    <h2>Ruby Services</h2>

                    <p>
                        Live health and availability of Ruby
                        platform and product services.
                    </p>
                </div>

                <button
                    type="button"
                    className="ruby-services-refresh"
                    onClick={() =>
                        void loadServices()
                    }
                    disabled={
                        loading ||
                        startingServiceId !== null
                    }
                >
                    {loading
                        ? "Checking..."
                        : "Refresh"}
                </button>
            </div>

            {error !== null ? (
                <div className="ruby-services-error">
                    {error}
                </div>
            ) : null}

            {data !== null ? (
                <>
                    <div className="ruby-services-summary">
                        <ServiceSummary
                            label="Total"
                            value={data.summary.total}
                        />

                        <ServiceSummary
                            label="Healthy"
                            value={data.summary.healthy}
                        />

                        <ServiceSummary
                            label="Degraded"
                            value={data.summary.degraded}
                        />

                        <ServiceSummary
                            label="Down"
                            value={data.summary.down}
                        />
                    </div>

                    <div className="ruby-services-list">
                        {data.services.map(
                            (service) => (
                                <ServiceRow
                                    key={service.id}
                                    service={service}
                                    starting={
                                        startingServiceId ===
                                        service.id
                                    }
                                    actionsDisabled={
                                        startingServiceId !==
                                        null
                                    }
                                    onStart={
                                        () => {
                                            void startService(
                                                service
                                            );
                                        }
                                    }
                                />
                            )
                        )}
                    </div>

                    <div className="ruby-services-checked">
                        Last checked:{" "}
                        {new Date(
                            data.checkedAt
                        ).toLocaleString()}
                    </div>
                </>
            ) : loading ? (
                <div className="ruby-services-loading">
                    Checking Ruby services...
                </div>
            ) : null}
        </div>
    );
}


function ServiceSummary({
    label,
    value
}: {
    label: string;
    value: number;
}) {
    return (
        <div className="ruby-service-summary-card">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}


function ServiceRow({
    service,
    starting,
    actionsDisabled,
    onStart
}: {
    service: RubyService;
    starting: boolean;
    actionsDisabled: boolean;
    onStart: () => void;
}) {
    return (
        <div className="ruby-service-row">
            <div
                className={
                    `ruby-service-status-indicator ` +
                    `ruby-service-status-${service.status}`
                }
                aria-hidden="true"
            />

            <div className="ruby-service-identity">
                <strong>{service.name}</strong>

                <span>
                    {service.category === "platform"
                        ? "Platform"
                        : "Product"}
                </span>
            </div>

            <div className="ruby-service-state">
                <span
                    className={
                        `ruby-service-status-label ` +
                        `ruby-service-status-label-${service.status}`
                    }
                >
                    {starting
                        ? "STARTING"
                        : service.status.toUpperCase()}
                </span>
            </div>

            <div className="ruby-service-port">
                Port {service.port}
            </div>

            <div className="ruby-service-response">
                {service.status === "healthy" &&
                service.responseTimeMs !== null
                    ? `${service.responseTimeMs} ms`
                    : "—"}
            </div>

            <div className="ruby-service-actions">
                {service.status === "down" ? (
                    <button
                        type="button"
                        className="ruby-service-start-button"
                        disabled={
                            actionsDisabled
                        }
                        onClick={onStart}
                    >
                        {starting
                            ? "Starting..."
                            : "Start"}
                    </button>
                ) : null}
            </div>
        </div>
    );
}