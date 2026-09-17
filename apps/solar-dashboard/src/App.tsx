import { useCallback, useEffect, useMemo, useState } from "react";

const TENANT_ID = "73c28616-633a-46b5-bd4d-2ad7971af02c";
const SITE_ID = "138c8b96-04ae-402d-93f9-89b3677734e1";
const SIMULATOR_SOURCE = "simulator.miramichi";

type SolarPage = "CONTROL_ROOM" | "PERFORMANCE" | "ALERTS" | "SITES_ASSETS" | "DEVICES";

interface TelemetryReading {
    readonly id: string;
    readonly deviceId: string;
    readonly measurementDefinitionId: string;
    readonly observedAt: string;
    readonly receivedAt?: string;
    readonly numericValue?: number;
    readonly quality: string;
    readonly source: string;
}

interface MeasurementDefinition {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly unit?: string;
}

interface EnergyFlow {
    readonly id: string;
    readonly sourceAssetId?: string;
    readonly destinationAssetId?: string;
    readonly direction: string;
    readonly powerKw: number;
    readonly energyKwh?: number;
    readonly observedAt: string;
    readonly source: string;
}

interface Asset {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly assetType: string;
}

interface Device {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly deviceType: string;
    readonly status: string;
    readonly lastSeenAt?: string;
}

interface AlarmEvent {
    readonly id: string;
    readonly severity: "INFO" | "WARNING" | "CRITICAL";
    readonly state: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    readonly title: string;
    readonly message: string;
    readonly measurementCode?: string;
    readonly measuredValue?: number;
    readonly thresholdValue?: number;
    readonly source: string;
    readonly occurredAt: string;
    readonly acknowledgedAt?: string;
    readonly resolvedAt?: string;
}

interface PerformanceMetric {
    readonly id: string;
    readonly metricCode: string;
    readonly value: number;
    readonly unit?: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly source: string;
    readonly calculatedAt: string;
}

interface LiveState {
    readonly pvKw: number;
    readonly loadKw: number;
    readonly irradiance: number;
    readonly temperatureC: number;
    readonly batterySoc: number;
    readonly batteryKwh: number;
    readonly batteryChargeKw: number;
    readonly batteryDischargeKw: number;
    readonly gridImportKw: number;
    readonly gridExportKw: number;
    readonly observedAt?: string;
    readonly receivedAt?: string;
}

const emptyLive: LiveState = {
    pvKw: 0,
    loadKw: 0,
    irradiance: 0,
    temperatureC: 0,
    batterySoc: 0,
    batteryKwh: 0,
    batteryChargeKw: 0,
    batteryDischargeKw: 0,
    gridImportKw: 0,
    gridExportKw: 0
};

function asArray<T>(payload: unknown): T[] {
    if (Array.isArray(payload)) return payload as T[];
    if (
        payload &&
        typeof payload === "object" &&
        "value" in payload &&
        Array.isArray((payload as { value?: unknown }).value)
    ) {
        return (payload as { value: T[] }).value;
    }
    return [];
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}_=${Date.now()}`, {
        headers,
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(`${url} returned HTTP ${response.status}.`);
    }

    return await response.json() as T;
}

interface StreamTelemetryPayload {
    readonly reading: TelemetryReading;
    readonly measurementCode?: string;
}

type StreamEvent =
    | { readonly type: "connected"; readonly data: unknown }
    | { readonly type: "telemetry-reading"; readonly data: StreamTelemetryPayload }
    | { readonly type: "energy-flow"; readonly data: EnergyFlow };

async function consumeSiteStream(
    signal: AbortSignal,
    onEvent: (event: StreamEvent) => void
): Promise<void> {
    const response = await fetch(
        `/api/v1/telemetry/sites/${SITE_ID}/stream`,
        {
            headers: {
                "x-tenant-id": TENANT_ID,
                Accept: "text/event-stream",
                "Cache-Control": "no-cache"
            },
            cache: "no-store",
            signal
        }
    );

    if (!response.ok || !response.body) {
        throw new Error(
            `Live stream returned HTTP ${response.status}.`
        );
    }

    const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
    let buffer = "";

    try {
        while (!signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;
            buffer = buffer.replace(/\r\n/g, "\n");

            let boundary = buffer.indexOf("\n\n");
            while (boundary >= 0) {
                const block = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                boundary = buffer.indexOf("\n\n");

                let eventType = "message";
                const dataLines: string[] = [];

                for (const line of block.split("\n")) {
                    if (line.startsWith(":")) continue;
                    if (line.startsWith("event:")) {
                        eventType = line.slice(6).trim();
                    } else if (line.startsWith("data:")) {
                        dataLines.push(line.slice(5).trimStart());
                    }
                }

                if (dataLines.length === 0) continue;

                const data = JSON.parse(dataLines.join("\n")) as unknown;
                if (eventType === "connected") {
                    onEvent({ type: "connected", data });
                } else if (eventType === "telemetry-reading") {
                    onEvent({
                        type: "telemetry-reading",
                        data: data as StreamTelemetryPayload
                    });
                } else if (eventType === "energy-flow") {
                    onEvent({
                        type: "energy-flow",
                        data: data as EnergyFlow
                    });
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

function App() {
    const [activePage, setActivePage] = useState<SolarPage>("CONTROL_ROOM");
    const [live, setLive] = useState<LiveState>(emptyLive);
    const [flows, setFlows] = useState<readonly EnergyFlow[]>([]);
    const [assets, setAssets] = useState<readonly Asset[]>([]);
    const [devices, setDevices] = useState<readonly Device[]>([]);
    const [alarms, setAlarms] = useState<readonly AlarmEvent[]>([]);
    const [performance, setPerformance] = useState<readonly PerformanceMetric[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const loadLive = useCallback(async () => {
        try {
            const headers = {
                "x-tenant-id": TENANT_ID,
                "Cache-Control": "no-cache"
            };

            const [
                readingPayload,
                definitionPayload,
                flowPayload,
                assetPayload,
                devicePayload,
                alarmPayload,
                performancePayload
            ] = await Promise.all([
                fetchJson<unknown>(`/api/v1/telemetry/sites/${SITE_ID}/readings?limit=100`, headers),
                fetchJson<unknown>("/api/v1/telemetry/measurement-definitions", headers),
                fetchJson<unknown>(`/api/v1/energy/sites/${SITE_ID}/flows?limit=100`, headers),
                fetchJson<unknown>(`/api/v1/telemetry/sites/${SITE_ID}/assets`, headers),
                fetchJson<unknown>(`/api/v1/telemetry/sites/${SITE_ID}/devices`, headers),
                fetchJson<unknown>(`/api/v1/energy/sites/${SITE_ID}/alarm-events?limit=25`, headers),
                fetchJson<unknown>(`/api/v1/energy/sites/${SITE_ID}/performance-metrics?limit=100`, headers)
            ]);

            const readings = asArray<TelemetryReading>(readingPayload);
            const definitions = asArray<MeasurementDefinition>(definitionPayload);
            const nextFlows = asArray<EnergyFlow>(flowPayload);
            const nextAssets = asArray<Asset>(assetPayload);
            const nextDevices = asArray<Device>(devicePayload);
            const nextAlarms = asArray<AlarmEvent>(alarmPayload);
            const nextPerformance =
                asArray<PerformanceMetric>(performancePayload);

            const definitionById = new Map(
                definitions.map((definition) => [definition.id, definition.code])
            );

            const latestByCode = new Map<string, TelemetryReading>();
            for (const reading of readings) {
                if (reading.source !== SIMULATOR_SOURCE) continue;

                const code = definitionById.get(reading.measurementDefinitionId);
                if (!code) continue;

                const previous = latestByCode.get(code);
                if (
                    !previous ||
                    new Date(reading.observedAt).getTime() >
                        new Date(previous.observedAt).getTime()
                ) {
                    latestByCode.set(code, reading);
                }
            }

            const value = (code: string): number =>
                latestByCode.get(code)?.numericValue ?? 0;

            const newest = Array.from(latestByCode.values()).sort(
                (a, b) =>
                    new Date(b.observedAt).getTime() -
                    new Date(a.observedAt).getTime()
            )[0];

            setLive({
                pvKw: value("solar.pv.ac_power"),
                loadKw: value("load.site.power"),
                irradiance: value("solar.irradiance"),
                temperatureC: value("environment.temperature"),
                batterySoc: value("battery.state_of_charge"),
                batteryKwh: value("battery.stored_energy"),
                batteryChargeKw: value("battery.charge_power"),
                batteryDischargeKw: value("battery.discharge_power"),
                gridImportKw: value("grid.import_power"),
                gridExportKw: value("grid.export_power"),
                observedAt: newest?.observedAt,
                receivedAt: newest?.receivedAt
            });

            setFlows(
                nextFlows
                    .filter((flow) => flow.source === SIMULATOR_SOURCE)
                    .sort(
                        (a, b) =>
                            new Date(b.observedAt).getTime() -
                            new Date(a.observedAt).getTime()
                    )
            );
            setAssets(nextAssets);
            setDevices(nextDevices);
            setPerformance(nextPerformance);
            setAlarms(
                nextAlarms.sort(
                    (a, b) =>
                        new Date(b.occurredAt).getTime() -
                        new Date(a.occurredAt).getTime()
                )
            );
            setConnected(true);
            setError(null);
            setLastRefresh(new Date());
        } catch (caught) {
            setConnected(false);
            setError(
                caught instanceof Error
                    ? caught.message
                    : "Unable to reach EIS API."
            );
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        let reconnectTimer: number | undefined;
        let stopped = false;

        const headers = {
            "x-tenant-id": TENANT_ID,
            "Cache-Control": "no-cache"
        };

        const refreshAlarms = async (): Promise<void> => {
            try {
                const payload = await fetchJson<unknown>(
                    `/api/v1/energy/sites/${SITE_ID}/alarm-events?limit=25`,
                    headers
                );
                const nextAlarms = asArray<AlarmEvent>(payload).sort(
                    (a, b) =>
                        new Date(b.occurredAt).getTime() -
                        new Date(a.occurredAt).getTime()
                );
                setAlarms(nextAlarms);
            } catch {
                // Stream remains authoritative for connectivity.
            }
        };

        const handleStreamEvent = (event: StreamEvent): void => {
            setConnected(true);
            setError(null);
            setLastRefresh(new Date());

            if (event.type === "connected") return;

            if (event.type === "energy-flow") {
                if (event.data.source !== SIMULATOR_SOURCE) return;
                setFlows((current) =>
                    [event.data, ...current.filter(
                        (flow) => flow.id !== event.data.id
                    )].slice(0, 100)
                );
                return;
            }

            const { reading, measurementCode } = event.data;
            if (reading.source !== SIMULATOR_SOURCE ||
                reading.numericValue === undefined ||
                !measurementCode) {
                return;
            }

            setLive((current) => {
                const freshness = {
                    observedAt: reading.observedAt,
                    receivedAt: reading.receivedAt ?? new Date().toISOString()
                };
                const value = reading.numericValue as number;

                switch (measurementCode) {
                    case "solar.pv.ac_power": return { ...current, ...freshness, pvKw: value };
                    case "load.site.power": return { ...current, ...freshness, loadKw: value };
                    case "solar.irradiance": return { ...current, ...freshness, irradiance: value };
                    case "environment.temperature": return { ...current, ...freshness, temperatureC: value };
                    case "battery.state_of_charge": return { ...current, ...freshness, batterySoc: value };
                    case "battery.stored_energy": return { ...current, ...freshness, batteryKwh: value };
                    case "battery.charge_power": return { ...current, ...freshness, batteryChargeKw: value };
                    case "battery.discharge_power": return { ...current, ...freshness, batteryDischargeKw: value };
                    case "grid.import_power": return { ...current, ...freshness, gridImportKw: value };
                    case "grid.export_power": return { ...current, ...freshness, gridExportKw: value };
                    default: return current;
                }
            });

            if (measurementCode === "battery.state_of_charge") {
                void refreshAlarms();
            }
        };

        const connect = async (): Promise<void> => {
            try {
                await consumeSiteStream(
                    controller.signal,
                    handleStreamEvent
                );

                if (!stopped && !controller.signal.aborted) {
                    throw new Error("Live stream disconnected.");
                }
            } catch (caught) {
                if (controller.signal.aborted || stopped) return;

                setConnected(false);
                setError(
                    caught instanceof Error
                        ? `${caught.message} Reconnecting…`
                        : "Live stream disconnected. Reconnecting…"
                );
                reconnectTimer = window.setTimeout(
                    () => void connect(),
                    2000
                );
            }
        };

        void loadLive().then(() => {
            if (!controller.signal.aborted) {
                void connect();
            }
        });

        return () => {
            stopped = true;
            controller.abort();
            if (reconnectTimer !== undefined) {
                window.clearTimeout(reconnectTimer);
            }
        };
    }, [loadLive]);

    const assetByCode = useMemo(
        () => new Map(assets.map((asset) => [asset.code, asset])),
        [assets]
    );

    const pv = assetByCode.get("MIRAMICHI-PV-ARRAY-001");
    const load = assetByCode.get("MIRAMICHI-SITE-LOAD-001");
    const battery = assetByCode.get("MIRAMICHI-BATTERY-001");
    const grid = assetByCode.get("MIRAMICHI-GRID-001");

    const latestFlow = (
        sourceId: string | undefined,
        destinationId: string | undefined
    ): EnergyFlow | undefined =>
        flows.find(
            (flow) =>
                flow.sourceAssetId === sourceId &&
                flow.destinationAssetId === destinationId
        );

    const pvToLoad = latestFlow(pv?.id, load?.id)?.powerKw ?? 0;
    const pvToBattery =
        latestFlow(pv?.id, battery?.id)?.powerKw ?? live.batteryChargeKw;
    const batteryToLoad =
        latestFlow(battery?.id, load?.id)?.powerKw ?? live.batteryDischargeKw;
    const gridToLoad =
        latestFlow(grid?.id, load?.id)?.powerKw ?? live.gridImportKw;
    const pvToGrid =
        latestFlow(pv?.id, grid?.id)?.powerKw ?? live.gridExportKw;

    const freshnessReference = live.receivedAt ?? live.observedAt;
    const ageSeconds = freshnessReference
        ? Math.max(
              0,
              Math.round(
                  (Date.now() - new Date(freshnessReference).getTime()) / 1000
              )
          )
        : null;

    const onlineDevices = devices.filter(
        (device) => device.status === "ONLINE"
    ).length;

    const batteryMode =
        live.batteryChargeKw > 0.01
            ? "CHARGING"
            : live.batteryDischargeKw > 0.01
              ? "DISCHARGING"
              : "IDLE";

    const gridMode =
        live.gridExportKw > 0.01
            ? "EXPORTING"
            : live.gridImportKw > 0.01
              ? "IMPORTING"
              : "BALANCED";

    const activeAlarms = alarms.filter(
        (alarm) => alarm.state !== "RESOLVED"
    );
    const criticalAlarms = activeAlarms.filter(
        (alarm) => alarm.severity === "CRITICAL"
    ).length;
    const warningAlarms = activeAlarms.filter(
        (alarm) => alarm.severity === "WARNING"
    ).length;

    const latestMetric = (code: string): PerformanceMetric | undefined =>
        performance
            .filter((metric) => metric.metricCode === code)
            .sort(
                (a, b) =>
                    new Date(b.calculatedAt).getTime() -
                    new Date(a.calculatedAt).getTime()
            )[0];

    const performanceCards = [
        ["Solar energy", "solar.production.energy"],
        ["Peak PV", "solar.peak_power"],
        ["Capacity factor", "solar.capacity_factor"],
        ["Site load energy", "site.load.energy"],
        ["Grid import", "grid.import.energy"],
        ["Grid export", "grid.export.energy"],
        ["Minimum battery SOC", "battery.soc.minimum"],
        ["Maximum battery SOC", "battery.soc.maximum"]
    ] as const;

    const pageTitle: Record<SolarPage, string> = {
        CONTROL_ROOM: "Live Control Room",
        PERFORMANCE: "Performance",
        ALERTS: "Alerts",
        SITES_ASSETS: "Sites & Assets",
        DEVICES: "Devices"
    };

    const pageDescription: Record<SolarPage, string> = {
        CONTROL_ROOM: "Real-time Miramichi energy operations and system state.",
        PERFORMANCE: "Calculated energy, production and battery performance from the EIS Performance Engine.",
        ALERTS: "Operational alarms generated from normalized EIS telemetry.",
        SITES_ASSETS: "Site and asset hierarchy for the Miramichi solar installation.",
        DEVICES: "Connected telemetry devices and communications status."
    };

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">EIS</div>
                    <div>
                        <div className="brand-name">Enterprise Intelligence System</div>
                        <div className="brand-subtitle">Operations Platform</div>
                    </div>
                </div>

                <nav className="platform-navigation" aria-label="EIS navigation">
                    <div className="nav-section-label">PLATFORM</div>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">⌂</span><span>Dashboard</span></button>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">✚</span><span>Athena</span></button>
                    <button className="nav-item platform-item solar-product active" type="button" onClick={() => setActivePage("CONTROL_ROOM")}><span className="nav-icon">☀</span><span>Solar Operations</span></button>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">✓</span><span>Compliance</span></button>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">↗</span><span>Workflow</span></button>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">◈</span><span>Security</span></button>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">✦</span><span>AI Hub</span></button>

                    <div className="nav-section-label solar-label">SOLAR OPERATIONS</div>
                    <button className={activePage === "CONTROL_ROOM" ? "nav-item sub-item active" : "nav-item sub-item"} type="button" onClick={() => setActivePage("CONTROL_ROOM")}><span className="nav-icon">◉</span><span>Live Control Room</span></button>
                    <button className={activePage === "PERFORMANCE" ? "nav-item sub-item active" : "nav-item sub-item"} type="button" onClick={() => setActivePage("PERFORMANCE")}><span className="nav-icon">◎</span><span>Performance</span></button>
                    <button className={activePage === "ALERTS" ? "nav-item sub-item active" : "nav-item sub-item"} type="button" onClick={() => setActivePage("ALERTS")}><span className="nav-icon">!</span><span>Alerts</span><span className={activeAlarms.length > 0 ? "nav-count warning" : "nav-count"}>{activeAlarms.length}</span></button>
                    <button className={activePage === "SITES_ASSETS" ? "nav-item sub-item active" : "nav-item sub-item"} type="button" onClick={() => setActivePage("SITES_ASSETS")}><span className="nav-icon">▦</span><span>Sites & Assets</span></button>
                    <button className={activePage === "DEVICES" ? "nav-item sub-item active" : "nav-item sub-item"} type="button" onClick={() => setActivePage("DEVICES")}><span className="nav-icon">◫</span><span>Devices</span></button>

                    <div className="nav-section-label administration-label">ADMINISTRATION</div>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">⚙</span><span>Administration</span></button>
                    <button className="nav-item platform-item" type="button"><span className="nav-icon">◷</span><span>Audit</span></button>
                </nav>

                <div className="sidebar-footer">
                    <div className="api-health"><span className={connected ? "health-dot online" : "health-dot"}/><span>{connected ? "All systems operational" : "EIS API disconnected"}</span></div>
                    <div className="user-profile"><div className="user-avatar">EA</div><div><strong>Administrator</strong><small>Platform Admin</small></div></div>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar app-topbar">
                    <div className="breadcrumb"><span>EIS</span><span>/</span><span>Solar Operations</span><span>/</span><strong>{pageTitle[activePage]}</strong></div>
                    <div className="topbar-actions"><button className="icon-button" type="button" aria-label="Notifications">♢{activeAlarms.length > 0 && <span className="notification-dot"/>}</button><button className="icon-button" type="button" aria-label="Help">?</button></div>
                </header>

                <div className="content">
                    <section className="page-header">
                        <div><div className="eyebrow">SOLAR OPERATIONS · TELEMETRY & ENERGY</div><h1>{pageTitle[activePage]}</h1><p>{pageDescription[activePage]}</p></div>
                        <div className="live-status"><span className={connected ? "pulse" : "pulse offline"}/><div><strong>{connected ? "LIVE" : "OFFLINE"}</strong><small>{lastRefresh ? `Streamed ${lastRefresh.toLocaleTimeString("en-CA")}` : "Connecting…"}</small></div></div>
                    </section>

                    {error && <div className="error-banner">{error}</div>}

                    {activePage === "CONTROL_ROOM" && <>
                        <section className="site-context"><div><span className="eyebrow">ACTIVE SITE</span><strong>Miramichi Solar</strong><small>3.75 kW PV · Simulator-backed live telemetry</small></div><div><span>Simulated time</span><strong>{live.observedAt ? new Date(live.observedAt).toLocaleString("en-CA") : "—"}</strong></div></section>
                        <section className="metrics-grid">
                            <Metric label="PV Production" value={`${live.pvKw.toFixed(2)} kW`} detail={`${live.irradiance.toFixed(0)} W/m² irradiance`} primary />
                            <Metric label="Site Load" value={`${live.loadKw.toFixed(2)} kW`} detail="Current facility demand" />
                            <Metric label="Battery" value={`${live.batterySoc.toFixed(1)}%`} detail={`${live.batteryKwh.toFixed(2)} kWh stored`} />
                            <Metric label="Grid" value={gridMode} detail={live.gridExportKw > 0.01 ? `${live.gridExportKw.toFixed(2)} kW export` : `${live.gridImportKw.toFixed(2)} kW import`} />
                        </section>
                        <section className="control-grid">
                            <article className="panel flow-panel"><div className="panel-header"><div><div className="eyebrow">REAL ENERGY FLOWS</div><h2>Power Flow</h2></div><span className="source-badge">{SIMULATOR_SOURCE}</span></div><div className="flow-map"><FlowNode kind="solar" title="Solar Array" value={`${live.pvKw.toFixed(2)} kW`} detail={`${live.irradiance.toFixed(0)} W/m²`}/><FlowLink label={`${pvToLoad.toFixed(2)} kW`} active={pvToLoad > 0.01}/><FlowNode kind="load" title="Site Load" value={`${live.loadKw.toFixed(2)} kW`} detail="Demand"/><div className="flow-branch"><FlowNode kind="battery" title="Battery" value={`${live.batterySoc.toFixed(1)}%`} detail={batteryMode}/><div className="branch-values"><FlowValue label="PV → Battery" value={pvToBattery} active={pvToBattery > 0.01}/><FlowValue label="Battery → Load" value={batteryToLoad} active={batteryToLoad > 0.01}/></div></div><div className="flow-branch"><FlowNode kind="grid" title="Grid" value={gridMode} detail={`${Math.max(live.gridImportKw, live.gridExportKw).toFixed(2)} kW`}/><div className="branch-values"><FlowValue label="PV → Grid" value={pvToGrid} active={pvToGrid > 0.01}/><FlowValue label="Grid → Load" value={gridToLoad} active={gridToLoad > 0.01}/></div></div></div></article>
                            <article className="panel conditions-panel"><div className="panel-header"><div><div className="eyebrow">SITE CONDITIONS</div><h2>Operational Status</h2></div></div><StatusRow label="Outdoor temperature" value={`${live.temperatureC.toFixed(1)} °C`}/><StatusRow label="Battery mode" value={batteryMode}/><StatusRow label="Battery charge" value={`${live.batteryChargeKw.toFixed(2)} kW`}/><StatusRow label="Battery discharge" value={`${live.batteryDischargeKw.toFixed(2)} kW`}/><StatusRow label="Grid state" value={gridMode}/><StatusRow label="Devices online" value={`${onlineDevices}/${devices.length}`}/><StatusRow label="Telemetry freshness" value={ageSeconds === null ? "—" : `${ageSeconds}s`}/></article>
                        </section>
                        <section className="summary-split"><article className="panel"><div className="panel-header"><div><div className="eyebrow">PERFORMANCE</div><h2>Latest 24-Hour Summary</h2></div><button className="text-button" type="button" onClick={() => setActivePage("PERFORMANCE")}>Open Performance →</button></div><div className="mini-performance-grid">{performanceCards.slice(0,4).map(([label,code]) => { const metric=latestMetric(code); return <div className="mini-performance" key={code}><span>{label}</span><strong>{metric ? `${metric.value.toFixed(2)} ${metric.unit ?? ""}`.trim() : "—"}</strong></div>; })}</div></article><article className="panel"><div className="panel-header"><div><div className="eyebrow">ALERTS</div><h2>Operational Signals</h2></div><button className="text-button" type="button" onClick={() => setActivePage("ALERTS")}>Open Alerts →</button></div><div className="alarm-summary large"><span className="alarm-count critical">{criticalAlarms} critical</span><span className="alarm-count warning">{warningAlarms} warning</span><span className="alarm-count">{activeAlarms.length} active</span></div>{alarms[0] ? <div className="latest-alarm"><strong>{alarms[0].title}</strong><small>{alarms[0].message}</small></div> : <div className="empty-state compact">No alarm events.</div>}</article></section>
                    </>}

                    {activePage === "PERFORMANCE" && <section className="content-stack"><section className="performance-hero"><div><span className="eyebrow">LATEST CALCULATED PERIOD</span><h2>Performance Analytics</h2><p>Eight persisted metrics calculated from normalized telemetry and energy flows.</p></div><span className="source-badge">eis.performance-engine</span></section>{performance.length === 0 ? <div className="panel empty-state">No calculated performance period yet.</div> : <><section className="performance-grid full">{performanceCards.map(([label,code]) => { const metric=latestMetric(code); return <div className="performance-card" key={code}><span>{label}</span><strong>{metric ? `${metric.value.toFixed(2)} ${metric.unit ?? ""}`.trim() : "—"}</strong><small>{metric ? `Through ${new Date(metric.periodEnd).toLocaleString("en-CA")}` : code}</small></div>; })}</section><article className="panel performance-detail"><div className="panel-header"><div><div className="eyebrow">ENGINE OUTPUT</div><h2>Calculated Metrics</h2></div></div><div className="metric-table"><div className="metric-table-row header"><span>Metric</span><span>Value</span><span>Period end</span><span>Source</span></div>{performanceCards.map(([label,code]) => { const metric=latestMetric(code); return <div className="metric-table-row" key={code}><div><strong>{label}</strong><small>{code}</small></div><strong>{metric ? `${metric.value.toFixed(4)} ${metric.unit ?? ""}`.trim() : "—"}</strong><span>{metric ? new Date(metric.periodEnd).toLocaleString("en-CA") : "—"}</span><span>{metric?.source ?? "—"}</span></div>; })}</div></article></>}</section>}

                    {activePage === "ALERTS" && <section className="panel alerts-panel"><div className="panel-header"><div><div className="eyebrow">ALERTS & INCIDENT SIGNALS</div><h2>Live Alarm Events</h2></div><div className="alarm-summary"><span className="alarm-count critical">{criticalAlarms} critical</span><span className="alarm-count warning">{warningAlarms} warning</span><span className="alarm-count">{activeAlarms.length} active</span></div></div>{alarms.length === 0 ? <div className="empty-state">No alarm events yet.</div> : <div className="alarm-list">{alarms.map((alarm) => <div className={`alarm-row ${alarm.severity.toLowerCase()} ${alarm.state.toLowerCase()}`} key={alarm.id}><span className="alarm-severity">{alarm.severity}</span><div className="alarm-copy"><strong>{alarm.title}</strong><small>{alarm.message}</small></div><div className="alarm-measurement"><strong>{alarm.measuredValue === undefined ? "—" : alarm.measuredValue.toFixed(2)}</strong><small>threshold {alarm.thresholdValue === undefined ? "—" : alarm.thresholdValue.toFixed(2)}</small></div><div className="alarm-time"><strong>{alarm.state}</strong><small>{new Date(alarm.occurredAt).toLocaleString("en-CA")}</small></div></div>)}</div>}</section>}

                    {activePage === "SITES_ASSETS" && <section className="content-stack"><article className="panel site-detail-card"><div className="panel-header"><div><div className="eyebrow">SITE</div><h2>Miramichi Solar</h2><p className="panel-copy">Normalized EIS site and energy assets currently feeding the Control Room.</p></div><span className={connected ? "status-pill online" : "status-pill"}>{connected ? "ONLINE" : "OFFLINE"}</span></div><div className="site-stat-grid"><StatusRow label="PV capacity" value="3.75 kW"/><StatusRow label="Assets" value={String(assets.length)}/><StatusRow label="Devices" value={String(devices.length)}/><StatusRow label="Telemetry source" value={SIMULATOR_SOURCE}/></div></article><article className="panel"><div className="panel-header"><div><div className="eyebrow">ASSET HIERARCHY</div><h2>Energy Assets</h2></div></div><div className="asset-grid">{assets.map(asset => <div className="asset-card" key={asset.id}><span className="asset-icon">{asset.assetType.includes("SOLAR") ? "☀" : asset.assetType.includes("BATTERY") ? "▣" : asset.assetType.includes("GRID") ? "⌁" : "⌂"}</span><div><strong>{asset.name}</strong><small>{asset.assetType}</small><code>{asset.code}</code></div></div>)}</div></article></section>}

                    {activePage === "DEVICES" && <section className="panel equipment-panel"><div className="panel-header"><div><div className="eyebrow">TELEMETRY DEVICES</div><h2>Connected Equipment</h2></div><strong>{onlineDevices}/{devices.length} online</strong></div><div className="device-grid expanded">{devices.map(device => <div className="device-card" key={device.id}><span className={device.status === "ONLINE" ? "device-dot online" : "device-dot"}/><div><strong>{device.name}</strong><small>{device.deviceType}</small><code>{device.code}</code></div><b>{device.status}</b></div>)}</div></section>}
                </div>
            </main>
        </div>
    );

}

function Metric({
    label,
    value,
    detail,
    primary = false
}: {
    readonly label: string;
    readonly value: string;
    readonly detail: string;
    readonly primary?: boolean;
}) {
    return (
        <article className={primary ? "metric primary" : "metric"}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </article>
    );
}

function FlowNode({
    kind,
    title,
    value,
    detail
}: {
    readonly kind: string;
    readonly title: string;
    readonly value: string;
    readonly detail: string;
}) {
    return (
        <div className={`flow-node ${kind}`}>
            <span>{title}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </div>
    );
}

function FlowLink({
    label,
    active
}: {
    readonly label: string;
    readonly active: boolean;
}) {
    return (
        <div className={active ? "flow-link active" : "flow-link"}>
            <div className="line">
                <i />
            </div>
            <strong>{label}</strong>
        </div>
    );
}

function FlowValue({
    label,
    value,
    active
}: {
    readonly label: string;
    readonly value: number;
    readonly active: boolean;
}) {
    return (
        <div className={active ? "flow-value active" : "flow-value"}>
            <span>{label}</span>
            <strong>{value.toFixed(2)} kW</strong>
        </div>
    );
}

function StatusRow({
    label,
    value
}: {
    readonly label: string;
    readonly value: string;
}) {
    return (
        <div className="status-row">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

export default App;
