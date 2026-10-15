const BASE_URL = process.env.TELEMETRY_ENERGY_BASE_URL ?? "http://localhost:4401";
const TENANT_ID = process.env.SIMULATOR_TENANT_ID ?? "73c28616-633a-46b5-bd4d-2ad7971af02c";
const SITE_ID = process.env.SIMULATOR_SITE_ID ?? "138c8b96-04ae-402d-93f9-89b3677734e1";
const SOURCE = process.env.SIMULATOR_SOURCE ?? "simulator.miramichi";
const INTERVAL_MS = positiveInteger(process.env.SIMULATOR_INTERVAL_MS, 5000);
const STEP_MINUTES = positiveNumber(process.env.SIMULATOR_STEP_MINUTES, 5);

const PV_CAPACITY_KW = 3.75;
const BATTERY_CAPACITY_KWH = 10;
const BATTERY_MIN_KWH = 1.5;
const BATTERY_MAX_KWH = 9.5;
const BATTERY_MAX_POWER_KW = 3;
const BATTERY_EFFICIENCY = Math.sqrt(0.92);

interface Asset {
    readonly id: string;
    readonly code: string;
}
interface Device {
    readonly id: string;
    readonly code: string;
}
interface Measurement {
    readonly id: string;
    readonly code: string;
}
interface Site {
    readonly id: string;
    readonly code: string;
    readonly name: string;
}
interface Assets {
    readonly pv: Asset;
    readonly load: Asset;
    readonly battery: Asset;
    readonly grid: Asset;
}
interface Devices {
    readonly inverter: Device;
    readonly loadMeter: Device;
    readonly battery: Device;
    readonly gridMeter: Device;
    readonly weather: Device;
}
interface Measurements {
    readonly pv: Measurement;
    readonly irradiance: Measurement;
    readonly temperature: Measurement;
    readonly load: Measurement;
    readonly soc: Measurement;
    readonly stored: Measurement;
    readonly charge: Measurement;
    readonly discharge: Measurement;
    readonly gridImport: Measurement;
    readonly gridExport: Measurement;
}
interface State {
    simulatedAt: Date;
    batteryKwh: number;
}

async function main(): Promise<void> {
    console.log("EIS Miramichi Energy Simulator");
    console.log(`API: ${BASE_URL}`);
    console.log(`Tenant: ${TENANT_ID}`);
    console.log(`Site: ${SITE_ID}`);
    console.log(`Cadence: ${INTERVAL_MS} ms real / ${STEP_MINUTES} simulated minutes`);

    await request("/health", "GET", undefined, false);
    const site = await get<Site>(`/api/v1/telemetry/sites/${SITE_ID}`);
    console.log(`Connected: ${site.name} (${site.code})`);

    const assets = await ensureAssets();
    const devices = await ensureDevices(assets);
    const measurements = await ensureMeasurements();
    const state: State = {
        simulatedAt: new Date(),
        batteryKwh: 6
    };

    console.log("Simulator initialized. Press Ctrl+C to stop.");
    await tick(state, assets, devices, measurements);

    const timer = setInterval(() => {
        void tick(state, assets, devices, measurements).catch((error: unknown) => {
            console.error(
                `[${new Date().toISOString()}] tick failed:`,
                error instanceof Error ? error.message : error
            );
        });
    }, INTERVAL_MS);

    process.on("SIGINT", () => {
        clearInterval(timer);
        console.log("\nMiramichi simulator stopped.");
        process.exit(0);
    });
}

async function ensureAssets(): Promise<Assets> {
    const existing = await get<Asset[]>(`/api/v1/telemetry/sites/${SITE_ID}/assets`);
    const ensure = async (
        code: string,
        name: string,
        assetType: string,
        manufacturer?: string
    ): Promise<Asset> => {
        const found = existing.find((item) => item.code === code);
        if (found) return found;
        const created = await post<Asset>("/api/v1/telemetry/assets", {
            siteId: SITE_ID,
            code,
            name,
            assetType,
            manufacturer,
            status: "ACTIVE"
        });
        existing.push(created);
        return created;
    };

    const result = {
        pv: await ensure("MIRAMICHI-PV-ARRAY-001", "Miramichi PV Array", "SOLAR_PV_ARRAY", "SAK"),
        load: await ensure("MIRAMICHI-SITE-LOAD-001", "Miramichi Site Load", "SITE_LOAD"),
        battery: await ensure("MIRAMICHI-BATTERY-001", "Miramichi Battery", "BATTERY_ENERGY_STORAGE"),
        grid: await ensure("MIRAMICHI-GRID-001", "Miramichi Grid Connection", "GRID_CONNECTION")
    };
    console.log("Assets ready.");
    return result;
}

async function ensureDevices(assets: Assets): Promise<Devices> {
    const existing = await get<Device[]>(`/api/v1/telemetry/sites/${SITE_ID}/devices`);
    const ensure = async (
        code: string,
        name: string,
        deviceType: string,
        assetId: string,
        externalDeviceId: string
    ): Promise<Device> => {
        const found = existing.find((item) => item.code === code);
        if (found) return found;
        const created = await post<Device>("/api/v1/telemetry/devices", {
            siteId: SITE_ID,
            assetId,
            code,
            name,
            deviceType,
            protocol: "SIMULATOR",
            externalDeviceId,
            status: "ONLINE"
        });
        existing.push(created);
        return created;
    };

    const result = {
        inverter: await ensure("MIRAMICHI-INVERTER-001", "Miramichi Solar Inverter", "SOLAR_INVERTER", assets.pv.id, "MIRAMICHI-INV-001"),
        loadMeter: await ensure("MIRAMICHI-SITE-METER-001", "Miramichi Site Load Meter", "POWER_METER", assets.load.id, "MIRAMICHI-LOAD-001"),
        battery: await ensure("MIRAMICHI-BATTERY-CTRL-001", "Miramichi Battery Controller", "BATTERY_CONTROLLER", assets.battery.id, "MIRAMICHI-BESS-001"),
        gridMeter: await ensure("MIRAMICHI-GRID-METER-001", "Miramichi Grid Meter", "POWER_METER", assets.grid.id, "MIRAMICHI-GRID-001"),
        weather: await ensure("MIRAMICHI-WEATHER-001", "Miramichi Weather Sensor", "ENVIRONMENT_SENSOR", assets.pv.id, "MIRAMICHI-WX-001")
    };
    console.log("Devices ready.");
    return result;
}

async function ensureMeasurements(): Promise<Measurements> {
    const existing = await get<Measurement[]>("/api/v1/telemetry/measurement-definitions");
    const ensure = async (
        code: string,
        name: string,
        unit: string,
        minimumValue: number,
        maximumValue: number
    ): Promise<Measurement> => {
        const found = existing.find((item) => item.code === code);
        if (found) return found;
        const created = await post<Measurement>("/api/v1/telemetry/measurement-definitions", {
            code,
            name,
            unit,
            dataType: "NUMBER",
            minimumValue,
            maximumValue
        });
        existing.push(created);
        return created;
    };

    const result = {
        pv: await ensure("solar.pv.ac_power", "PV AC Power", "kW", 0, 3.75),
        irradiance: await ensure("solar.irradiance", "Solar Irradiance", "W/m2", 0, 1400),
        temperature: await ensure("environment.temperature", "Outdoor Temperature", "C", -50, 60),
        load: await ensure("load.site.power", "Site Load Power", "kW", 0, 25),
        soc: await ensure("battery.state_of_charge", "Battery State of Charge", "%", 0, 100),
        stored: await ensure("battery.stored_energy", "Battery Stored Energy", "kWh", 0, 10),
        charge: await ensure("battery.charge_power", "Battery Charge Power", "kW", 0, 3),
        discharge: await ensure("battery.discharge_power", "Battery Discharge Power", "kW", 0, 3),
        gridImport: await ensure("grid.import_power", "Grid Import Power", "kW", 0, 25),
        gridExport: await ensure("grid.export_power", "Grid Export Power", "kW", 0, 25)
    };
    console.log("Measurement definitions ready.");
    return result;
}

async function tick(
    state: State,
    assets: Assets,
    devices: Devices,
    measurements: Measurements
): Promise<void> {
    const hour = miramichiHour(state.simulatedAt);
    const daylight = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));
    const cloud = 0.84 + 0.1 * Math.sin(state.simulatedAt.getTime() / 1800000);
    const irradiance = clamp(1000 * daylight * cloud, 0, 1100);
    const temperature = 12 + 8 * Math.sin(Math.PI * (hour - 8) / 12);
    const derate = temperature > 25 ? 1 - (temperature - 25) * 0.004 : 1;
    const pv = clamp(PV_CAPACITY_KW * irradiance / 1000 * derate, 0, PV_CAPACITY_KW);
    const load = clamp(
        0.65 +
        1.25 * gaussian(hour, 7.5, 1.7) +
        1.65 * gaussian(hour, 18.5, 2.2) +
        0.15 * Math.sin(state.simulatedAt.getTime() / 900000),
        0.35,
        4.5
    );

    const hours = STEP_MINUTES / 60;
    const pvToLoad = Math.min(pv, load);
    let surplus = Math.max(0, pv - load);
    let deficit = Math.max(0, load - pv);

    const chargeLimit = Math.max(0, (BATTERY_MAX_KWH - state.batteryKwh) / hours);
    const pvToBattery = Math.min(surplus, BATTERY_MAX_POWER_KW, chargeLimit);
    state.batteryKwh = Math.min(
        BATTERY_MAX_KWH,
        state.batteryKwh + pvToBattery * hours * BATTERY_EFFICIENCY
    );
    surplus -= pvToBattery;

    const dischargeLimit = Math.max(0, (state.batteryKwh - BATTERY_MIN_KWH) / hours);
    const batteryToLoad = Math.min(deficit, BATTERY_MAX_POWER_KW, dischargeLimit);
    state.batteryKwh = Math.max(
        BATTERY_MIN_KWH,
        state.batteryKwh - batteryToLoad * hours / BATTERY_EFFICIENCY
    );
    deficit -= batteryToLoad;

    const gridToLoad = Math.max(0, deficit);
    const pvToGrid = Math.max(0, surplus);
    const soc = state.batteryKwh / BATTERY_CAPACITY_KWH * 100;
    const observedAt = state.simulatedAt.toISOString();

    await Promise.all([
        reading(devices.inverter.id, measurements.pv.id, pv, observedAt),
        reading(devices.weather.id, measurements.irradiance.id, irradiance, observedAt),
        reading(devices.weather.id, measurements.temperature.id, temperature, observedAt),
        reading(devices.loadMeter.id, measurements.load.id, load, observedAt),
        reading(devices.battery.id, measurements.soc.id, soc, observedAt),
        reading(devices.battery.id, measurements.stored.id, state.batteryKwh, observedAt),
        reading(devices.battery.id, measurements.charge.id, pvToBattery, observedAt),
        reading(devices.battery.id, measurements.discharge.id, batteryToLoad, observedAt),
        reading(devices.gridMeter.id, measurements.gridImport.id, gridToLoad, observedAt),
        reading(devices.gridMeter.id, measurements.gridExport.id, pvToGrid, observedAt)
    ]);

    const flows: Promise<unknown>[] = [];
    if (pvToLoad > 0) flows.push(flow(assets.pv.id, assets.load.id, "TRANSFER", pvToLoad, observedAt));
    if (pvToBattery > 0) flows.push(flow(assets.pv.id, assets.battery.id, "CHARGE", pvToBattery, observedAt));
    if (batteryToLoad > 0) flows.push(flow(assets.battery.id, assets.load.id, "DISCHARGE", batteryToLoad, observedAt));
    if (gridToLoad > 0) flows.push(flow(assets.grid.id, assets.load.id, "IMPORT", gridToLoad, observedAt));
    if (pvToGrid > 0) flows.push(flow(assets.pv.id, assets.grid.id, "EXPORT", pvToGrid, observedAt));
    await Promise.all(flows);

    console.log(
        `${observedAt} | PV ${pv.toFixed(2)} kW | Load ${load.toFixed(2)} kW | ` +
        `Battery ${soc.toFixed(1)}% | Grid +${gridToLoad.toFixed(2)}/-${pvToGrid.toFixed(2)} kW`
    );

    state.simulatedAt = new Date(state.simulatedAt.getTime() + STEP_MINUTES * 60000);
}

async function reading(
    deviceId: string,
    measurementDefinitionId: string,
    numericValue: number,
    observedAt: string
): Promise<void> {
    await post("/api/v1/telemetry/readings", {
        siteId: SITE_ID,
        deviceId,
        measurementDefinitionId,
        observedAt,
        numericValue: round(numericValue, 6),
        quality: "GOOD",
        source: SOURCE
    });
}

async function flow(
    sourceAssetId: string,
    destinationAssetId: string,
    direction: "TRANSFER" | "CHARGE" | "DISCHARGE" | "IMPORT" | "EXPORT",
    powerKw: number,
    observedAt: string
): Promise<void> {
    await post("/api/v1/energy/flows", {
        siteId: SITE_ID,
        sourceAssetId,
        destinationAssetId,
        direction,
        powerKw: round(powerKw, 6),
        energyKwh: round(powerKw * STEP_MINUTES / 60, 8),
        observedAt,
        source: SOURCE
    });
}

async function get<T>(path: string): Promise<T> {
    return request<T>(path, "GET");
}
async function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, "POST", body);
}
async function request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    includeTenant = true
): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (includeTenant) headers["x-tenant-id"] = TENANT_ID;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${method} ${path} failed (${response.status}): ${text}`);
    }
    return text ? JSON.parse(text) as T : undefined as T;
}

function miramichiHour(date: Date): number {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Moncton",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hour + minute / 60;
}
function gaussian(x: number, center: number, width: number): number {
    const d = (x - center) / width;
    return Math.exp(-0.5 * d * d);
}
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
function round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
function positiveInteger(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Expected a positive integer, received "${value}".`);
    }
    return parsed;
}
function positiveNumber(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Expected a positive number, received "${value}".`);
    }
    return parsed;
}

void main().catch((error: unknown) => {
    console.error(
        "Miramichi simulator failed:",
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});

