import {
    useCallback,
    useEffect,
    useState
} from "react";
import { useI18n } from "./i18n/I18nProvider.js";
import { ClientsPanel } from "./ClientsPanel.js";


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




export function AdministrationWorkspace() {
    const { t } = useI18n();
    const tabs: AdministrationTabDefinition[] = [
        { key: "overview", label: t("administrationWorkspace.tabs.overview") },
        { key: "clients", label: t("administrationWorkspace.tabs.clients") },
        { key: "users", label: t("administrationWorkspace.tabs.users") },
        { key: "products", label: t("administrationWorkspace.tabs.products") },
        { key: "services", label: t("administrationWorkspace.tabs.services") },
        { key: "telemetry-policies", label: t("administrationWorkspace.tabs.telemetryPolicies") },
        { key: "audit", label: t("administrationWorkspace.tabs.audit") }
    ];
    const [activeTab, setActiveTab] =
        useState<AdministrationTab>(
            "overview"
        );

    return (
        <div className="administration-workspace">
            <div className="page-header">
                <div>
                    <div className="page-eyebrow">
                        {t("administrationWorkspace.eyebrow")}
                    </div>

                    <h1>{t("administrationWorkspace.title")}</h1>

                    <p>
                        {t("administrationWorkspace.description")}
                    </p>
                </div>
            </div>

            <div
                className="administration-tabs"
                role="tablist"
                aria-label={t("administrationWorkspace.title")}
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
    const { t } = useI18n();
    switch (activeTab) {
        case "overview":
            return (
                <>
                    <h2>
                        {t("administrationWorkspace.overview.title")}
                    </h2>

                    <p>
                        {t("administrationWorkspace.overview.description")}
                    </p>
                </>
            );

        case "clients":
            return <ClientsPanel />;

        case "users":
            return (
                <>
                    <h2>{t("administrationWorkspace.tabs.users")}</h2>

                    <p>
                        {t("administrationWorkspace.users.description")}
                    </p>
                </>
            );

        case "products":
            return (
                <>
                    <h2>
                        {t("administrationWorkspace.tabs.products")}
                    </h2>

                    <p>
                        {t("administrationWorkspace.products.description")}
                    </p>
                </>
            );

        case "services":
            return <ServicesPanel />;

        case "telemetry-policies":
            return (
                <>
                    <h2>
                        {t("administrationWorkspace.tabs.telemetryPolicies")}
                    </h2>

                    <p>
                        {t("administrationWorkspace.telemetryPolicies.description")}
                    </p>
                </>
            );

        case "audit":
            return (
                <>
                    <h2>{t("administrationWorkspace.tabs.audit")}</h2>

                    <p>
                        {t("administrationWorkspace.audit.description")}
                    </p>
                </>
            );
    }
}
function ServicesPanel() {
    const { t, locale } = useI18n();
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
                        t("administrationWorkspace.service.requestError", { status: response.status })
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
                        : t("administrationWorkspace.service.loadError")
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
                        t("administrationWorkspace.service.confirmStart", { name: service.name })
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
                            t("administrationWorkspace.service.startError", { name: service.name })
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
                    <h2>{t("administrationWorkspace.service.title")}</h2>

                    <p>
                        {t("administrationWorkspace.service.description")}
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
                        ? t("administrationWorkspace.service.checking")
                        : t("administrationWorkspace.service.refresh")}
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
                            label={t("administrationWorkspace.service.total")}
                            value={data.summary.total}
                        />

                        <ServiceSummary
                            label={t("administrationWorkspace.service.healthy")}
                            value={data.summary.healthy}
                        />

                        <ServiceSummary
                            label={t("administrationWorkspace.service.degraded")}
                            value={data.summary.degraded}
                        />

                        <ServiceSummary
                            label={t("administrationWorkspace.service.down")}
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
                        {t("administrationWorkspace.service.lastChecked")}{" "}
                        {new Date(
                            data.checkedAt
                        ).toLocaleString(locale)}
                    </div>
                </>
            ) : loading ? (
                <div className="ruby-services-loading">
                    {t("administrationWorkspace.service.loading")}
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
    const { t } = useI18n();
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
                        ? t("administrationWorkspace.service.platform")
                        : t("administrationWorkspace.service.product")}
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
                        ? t("administrationWorkspace.service.starting")
                        : t(`administrationWorkspace.service.status${service.status.charAt(0).toUpperCase() + service.status.slice(1)}` as "administrationWorkspace.service.statusHealthy" | "administrationWorkspace.service.statusDegraded" | "administrationWorkspace.service.statusDown")}
                </span>
            </div>

            <div className="ruby-service-port">
                {t("administrationWorkspace.service.port")} {service.port}
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
                            ? t("administrationWorkspace.service.startingAction")
                            : t("administrationWorkspace.service.start")}
                    </button>
                ) : null}
            </div>
        </div>
    );
}