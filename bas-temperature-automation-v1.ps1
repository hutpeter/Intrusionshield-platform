$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$sourcePath = Join-Path $root 'apps/admin-portal/src/BasDashboard.tsx'
$cssPath = Join-Path $root 'apps/admin-portal/src/BasDashboard.css'
$automationPath = Join-Path $root 'apps/admin-portal/src/basTemperatureAutomation.ts'

if (!(Test-Path $sourcePath) -or !(Test-Path $cssPath)) {
    throw 'Run this from the intrusionshield-platform repository root.'
}

$source = [IO.File]::ReadAllText($sourcePath)
if ($source.Contains('evaluateTemperatureAutomation')) {
    throw 'Temperature Automation v1 already appears to be installed. No files changed.'
}

function Replace-Once([string]$old, [string]$new) {
    $count = ([regex]::Matches($script:source, [regex]::Escape($old))).Count
    if ($count -ne 1) {
        throw "Expected exactly one insertion point; found $count for: $old`nNo files changed."
    }
    $script:source = $script:source.Replace($old, $new)
}

# 1. Add automation logic import beside the existing comfort import.
Replace-Once 'import { apparentTemperatureF, suggestedCoolingTargetF } from "./basComfort";' @'
import { apparentTemperatureF, suggestedCoolingTargetF } from "./basComfort";
import {
    defaultTemperatureSchedules,
    evaluateTemperatureAutomation,
    moveSimulatedTemperature,
    type TemperatureSchedule
} from "./basTemperatureAutomation";
'@

# 2. Add labels immediately before the existing tab state.
Replace-Once '    const [tab, setTab] = useState<Tab>("overview");' @'
    const automationLabels = language === "es" ? {
        title: "Automatización de temperatura", enabled: "Automatización activada",
        current: "Temperatura de control", target: "Objetivo activo", state: "Estado HVAC",
        schedule: "Programa activo", noSchedule: "Sin programa activo", deadband: "Banda muerta",
        speed: "Velocidad de prueba", fast: "Prueba rápida", reset: "Restablecer simulación",
        name: "Nombre", days: "Días", start: "Inicio", end: "Fin", targetTemp: "Objetivo °F",
        on: "Activo", note: "Modo de prueba: la temperatura de control se mueve rápidamente hacia el objetivo para validar la automatización. El adaptador de equipo físico se conectará posteriormente.",
        heating: "CALENTANDO", cooling: "ENFRIANDO", idle: "INACTIVO"
    } : {
        title: "Temperature automation", enabled: "Automation enabled",
        current: "Control temperature", target: "Active target", state: "HVAC state",
        schedule: "Active schedule", noSchedule: "No active schedule", deadband: "Deadband",
        speed: "Test speed", fast: "Fast test", reset: "Reset simulation",
        name: "Name", days: "Days", start: "Start", end: "End", targetTemp: "Target °F",
        on: "Enabled", note: "Test mode: the control temperature moves quickly toward the target so automation can be validated without waiting for real building response. A physical equipment adapter will be connected later.",
        heating: "HEATING", cooling: "COOLING", idle: "IDLE"
    };
    const [tab, setTab] = useState<Tab>("overview");
'@

# 3. Add automation state after the existing planning-target state/function.
$planningAnchor = @'
    function setPlanningTarget(value: number | null) {
        setTargetOverride(value);
        try {
            if (value === null) localStorage.removeItem(preferenceKey);
            else localStorage.setItem(preferenceKey, String(value));
        } catch { /* Browser storage may be unavailable. */ }
    }
'@
$planningReplacement = $planningAnchor + @'
    const automationKey = `ruby.bas.temperatureAutomation.${tenantId}.${siteId}`;
    const [automationEnabled, setAutomationEnabled] = useState(true);
    const [deadbandF, setDeadbandF] = useState(1);
    const [simulationSpeed, setSimulationSpeed] = useState(8);
    const [temperatureSchedules, setTemperatureSchedules] = useState<TemperatureSchedule[]>(defaultTemperatureSchedules);
    const [simulatedControlTemperature, setSimulatedControlTemperature] = useState<number | null>(null);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(automationKey);
            if (!stored) return;
            const parsed = JSON.parse(stored) as {
                enabled?: boolean; deadbandF?: number; speed?: number; schedules?: TemperatureSchedule[];
            };
            if (typeof parsed.enabled === "boolean") setAutomationEnabled(parsed.enabled);
            if (typeof parsed.deadbandF === "number" && parsed.deadbandF >= 0.5 && parsed.deadbandF <= 4) setDeadbandF(parsed.deadbandF);
            if (typeof parsed.speed === "number" && parsed.speed >= 1 && parsed.speed <= 20) setSimulationSpeed(parsed.speed);
            if (Array.isArray(parsed.schedules) && parsed.schedules.length > 0) setTemperatureSchedules(parsed.schedules);
        } catch { /* Keep safe defaults. */ }
    }, [automationKey]);

    useEffect(() => {
        try {
            localStorage.setItem(automationKey, JSON.stringify({
                enabled: automationEnabled, deadbandF, speed: simulationSpeed, schedules: temperatureSchedules
            }));
        } catch { /* Browser storage may be unavailable. */ }
    }, [automationKey, automationEnabled, deadbandF, simulationSpeed, temperatureSchedules]);
'@
Replace-Once $planningAnchor $planningReplacement

# 4. Evaluate the active schedule after the existing comfort calculations.
$calcAnchor = @'
    const planningTarget = targetOverride ?? suggested;
'@
$calcReplacement = $calcAnchor + @'
    const automation = evaluateTemperatureAutomation(
        new Date(), temperatureSchedules, simulatedControlTemperature ?? latest?.temperature ?? null,
        deadbandF, automationEnabled
    );

    useEffect(() => {
        if (simulatedControlTemperature === null && latest?.temperature !== undefined) {
            setSimulatedControlTemperature(latest.temperature);
        }
    }, [latest?.temperature, simulatedControlTemperature]);

    useEffect(() => {
        if (!automationEnabled || automation.targetF === null || simulatedControlTemperature === null) return;
        const timer = window.setInterval(() => {
            setSimulatedControlTemperature(current => current === null ? current :
                moveSimulatedTemperature(current, automation.targetF, automation.state, simulationSpeed));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [automationEnabled, automation.targetF, automation.state, simulationSpeed, simulatedControlTemperature === null]);

    function updateTemperatureSchedule(id: string, patch: Partial<TemperatureSchedule>) {
        setTemperatureSchedules(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    }
'@
Replace-Once $calcAnchor $calcReplacement

# 5. Insert the automation card immediately before the existing comfort card.
$uiAnchor = '        <div className="bas-comfort">'
$ui = @'
        <section className="bas-automation">
            <div className="bas-automation-heading">
                <div>
                    <h2>{automationLabels.title}</h2>
                    <p>{automationLabels.note}</p>
                </div>
                <label className="bas-automation-toggle">
                    <input type="checkbox" checked={automationEnabled}
                        onChange={event => setAutomationEnabled(event.target.checked)} />
                    <span>{automationLabels.enabled}</span>
                </label>
            </div>

            <div className="bas-automation-status">
                <p><span>{automationLabels.current}</span><strong>{fmt(simulatedControlTemperature ?? undefined, " °F")}</strong></p>
                <p><span>{automationLabels.target}</span><strong>{fmt(automation.targetF ?? undefined, " °F")}</strong></p>
                <p><span>{automationLabels.state}</span><strong className={`bas-hvac-${automation.state.toLowerCase()}`}>
                    {automation.state === "HEATING" ? automationLabels.heating : automation.state === "COOLING" ? automationLabels.cooling : automationLabels.idle}
                </strong></p>
                <p><span>{automationLabels.schedule}</span><strong>{automation.schedule?.name ?? automationLabels.noSchedule}</strong></p>
            </div>

            <div className="bas-automation-controls">
                <label>{automationLabels.deadband}: <strong>{deadbandF.toFixed(1)} °F</strong>
                    <input type="range" min="0.5" max="4" step="0.5" value={deadbandF}
                        onChange={event => setDeadbandF(Number(event.target.value))} />
                </label>
                <label>{automationLabels.speed}: <strong>{simulationSpeed}×</strong>
                    <input type="range" min="1" max="20" step="1" value={simulationSpeed}
                        onChange={event => setSimulationSpeed(Number(event.target.value))} />
                </label>
                <button type="button" onClick={() => setSimulationSpeed(20)}>{automationLabels.fast}</button>
                <button type="button" onClick={() => setSimulatedControlTemperature(latest?.temperature ?? null)}>{automationLabels.reset}</button>
            </div>

            <div className="bas-schedule-table-wrap">
                <table className="bas-schedule-table">
                    <thead><tr>
                        <th>{automationLabels.on}</th><th>{automationLabels.name}</th><th>{automationLabels.days}</th>
                        <th>{automationLabels.start}</th><th>{automationLabels.end}</th><th>{automationLabels.targetTemp}</th>
                    </tr></thead>
                    <tbody>{temperatureSchedules.map(item => <tr key={item.id}>
                        <td><input type="checkbox" checked={item.enabled} onChange={event => updateTemperatureSchedule(item.id, { enabled: event.target.checked })} /></td>
                        <td><input value={item.name} onChange={event => updateTemperatureSchedule(item.id, { name: event.target.value })} /></td>
                        <td><input value={item.days.join(",")} title="0=Sun, 1=Mon ... 6=Sat"
                            onChange={event => updateTemperatureSchedule(item.id, { days: event.target.value.split(",").map(Number).filter(day => day >= 0 && day <= 6) })} /></td>
                        <td><input type="time" value={item.startTime} onChange={event => updateTemperatureSchedule(item.id, { startTime: event.target.value })} /></td>
                        <td><input type="time" value={item.endTime} onChange={event => updateTemperatureSchedule(item.id, { endTime: event.target.value })} /></td>
                        <td><input type="number" min="55" max="85" step="0.5" value={item.targetF}
                            onChange={event => updateTemperatureSchedule(item.id, { targetF: Number(event.target.value) })} /></td>
                    </tr>)}</tbody>
                </table>
            </div>
        </section>

        <div className="bas-comfort">
'@
Replace-Once $uiAnchor $ui

$automationLogic = @'
export type HvacAutomationState = "HEATING" | "COOLING" | "IDLE";

export interface TemperatureSchedule {
    id: string;
    name: string;
    days: number[];
    startTime: string;
    endTime: string;
    targetF: number;
    enabled: boolean;
    startDate?: string;
    endDate?: string;
}

export interface TemperatureAutomationResult {
    schedule: TemperatureSchedule | null;
    targetF: number | null;
    state: HvacAutomationState;
}

export const defaultTemperatureSchedules: TemperatureSchedule[] = [
    { id: "morning", name: "Morning", days: [0,1,2,3,4,5,6], startTime: "06:00", endTime: "08:30", targetF: 72, enabled: true },
    { id: "day", name: "Daytime", days: [0,1,2,3,4,5,6], startTime: "08:30", endTime: "17:00", targetF: 70, enabled: true },
    { id: "evening", name: "Evening", days: [0,1,2,3,4,5,6], startTime: "17:00", endTime: "22:30", targetF: 72, enabled: true },
    { id: "overnight", name: "Overnight", days: [0,1,2,3,4,5,6], startTime: "22:30", endTime: "06:00", targetF: 66, enabled: true }
];

function minutes(value: string): number {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
}

function dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function scheduleMatches(schedule: TemperatureSchedule, now: Date): boolean {
    if (!schedule.enabled) return false;
    const today = dateKey(now);
    if (schedule.startDate && today < schedule.startDate) return false;
    if (schedule.endDate && today > schedule.endDate) return false;

    const current = now.getHours() * 60 + now.getMinutes();
    const start = minutes(schedule.startTime);
    const end = minutes(schedule.endTime);

    if (start < end) return schedule.days.includes(now.getDay()) && current >= start && current < end;
    if (current >= start) return schedule.days.includes(now.getDay());
    const yesterday = (now.getDay() + 6) % 7;
    return schedule.days.includes(yesterday) && current < end;
}

export function evaluateTemperatureAutomation(
    now: Date,
    schedules: TemperatureSchedule[],
    currentTemperatureF: number | null,
    deadbandF: number,
    enabled: boolean
): TemperatureAutomationResult {
    if (!enabled) return { schedule: null, targetF: null, state: "IDLE" };
    const schedule = schedules.find(item => scheduleMatches(item, now)) ?? null;
    if (!schedule || currentTemperatureF === null || !Number.isFinite(currentTemperatureF)) {
        return { schedule, targetF: schedule?.targetF ?? null, state: "IDLE" };
    }
    const halfBand = Math.max(0.25, deadbandF / 2);
    if (currentTemperatureF < schedule.targetF - halfBand) return { schedule, targetF: schedule.targetF, state: "HEATING" };
    if (currentTemperatureF > schedule.targetF + halfBand) return { schedule, targetF: schedule.targetF, state: "COOLING" };
    return { schedule, targetF: schedule.targetF, state: "IDLE" };
}

export function moveSimulatedTemperature(
    currentF: number,
    targetF: number,
    state: HvacAutomationState,
    speed: number
): number {
    if (state === "IDLE") return currentF;
    const step = Math.max(0.05, Math.min(0.8, speed * 0.04));
    const next = state === "HEATING" ? Math.min(targetF, currentF + step) : Math.max(targetF, currentF - step);
    return Math.round(next * 10) / 10;
}
'@

$styles = @'

/* Ruby BAS Temperature Automation v1 */
.bas-automation { margin: 18px 0; padding: 18px; border: 3px solid #58c7ba; border-radius: 12px; background: #17283b; }
.bas-automation-heading { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; flex-wrap: wrap; }
.bas-automation-heading h2 { margin: 0 0 6px; font-size: 1.25rem; }
.bas-automation-heading p { margin: 0; max-width: 80ch; color: #d5e5f2; }
.bas-automation-toggle { display: flex; gap: 8px; align-items: center; font-weight: 800; }
.bas-automation-status { display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 10px; margin: 16px 0; }
.bas-automation-status p { margin: 0; padding: 12px; border: 2px solid #527a96; border-radius: 9px; background: #20364d; }
.bas-automation-status span,.bas-automation-status strong { display:block; }
.bas-automation-status strong { margin-top:5px; font-size:1.18rem; }
.bas-hvac-heating { color:#ffcf70; }.bas-hvac-cooling { color:#8fe9ff; }.bas-hvac-idle { color:#9ce6b2; }
.bas-automation-controls { display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin:14px 0; }
.bas-automation-controls label { min-width:220px; font-weight:700; }
.bas-automation-controls input[type=range] { display:block; width:220px; margin-top:7px; accent-color:#87eee1; }
.bas-automation button { color:#fff; background:#305d73; border:2px solid #87eee1; border-radius:8px; padding:8px 12px; font:inherit; font-weight:700; cursor:pointer; }
.bas-schedule-table-wrap { overflow-x:auto; }
.bas-schedule-table { width:100%; border-collapse:collapse; min-width:760px; }
.bas-schedule-table th,.bas-schedule-table td { padding:8px; border-bottom:1px solid #527a96; text-align:left; }
.bas-schedule-table th { color:#9feee4; }
.bas-schedule-table input:not([type=checkbox]) { width:100%; min-width:90px; box-sizing:border-box; color:#fff; background:#213a52; border:1px solid #6488a5; border-radius:6px; padding:7px; }
.bas-automation input:focus-visible,.bas-automation button:focus-visible { outline:3px solid #ffdc82; outline-offset:2px; }
'@

$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($automationPath, $automationLogic + "`n", $utf8)
[IO.File]::WriteAllText($sourcePath, $source, $utf8)
[IO.File]::AppendAllText($cssPath, $styles + "`n", $utf8)

Write-Host "`nTemperature Automation v1 installed." -ForegroundColor Green
Write-Host "Created: apps/admin-portal/src/basTemperatureAutomation.ts"
Write-Host "Updated: apps/admin-portal/src/BasDashboard.tsx"
Write-Host "Updated: apps/admin-portal/src/BasDashboard.css"
Write-Host "`nNow run:"
Write-Host "pnpm --filter @intrusionshield/admin-portal build" -ForegroundColor Cyan
