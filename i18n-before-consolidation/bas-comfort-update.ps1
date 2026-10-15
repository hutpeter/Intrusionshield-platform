$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$sourcePath = Join-Path $root 'apps/admin-portal/src/BasDashboard.tsx'
$cssPath = Join-Path $root 'apps/admin-portal/src/BasDashboard.css'
$logicPath = Join-Path $root 'apps/admin-portal/src/basComfort.ts'
if (!(Test-Path $sourcePath) -or !(Test-Path $cssPath)) { throw 'Run this from the repository root after BAS is installed.' }
$source = [IO.File]::ReadAllText($sourcePath)
if ($source.Contains('suggestedCoolingTargetF')) { throw 'Comfort UI already installed. No files changed.' }
function Replace-Once([string]$old, [string]$new) {
    $count = ([regex]::Matches($script:source, [regex]::Escape($old))).Count
    if ($count -ne 1) { throw "Expected one matching insertion point; found $count for $old. No files changed." }
    $script:source = $script:source.Replace($old, $new)
}
Replace-Once 'import "./BasDashboard.css";' ('import "./BasDashboard.css";' + "`n" + 'import { apparentTemperatureF, suggestedCoolingTargetF } from "./basComfort";')
Replace-Once '    const [tab, setTab] = useState<Tab>("overview");' @'
    const comfortLabels = language === "es" ? {
        apparent: "Temperatura percibida estimada", suggested: "Objetivo de enfriamiento sugerido",
        chosen: "Objetivo de planificación", reset: "Usar sugerencia",
        advisory: "Estimación basada en temperatura y humedad; se supone una velocidad del aire de 0,1 m/s. Se guarda en este navegador y no controla el equipo.",
        waiting: "El objetivo estará disponible cuando lleguen lecturas de temperatura y humedad."
    } : {
        apparent: "Estimated apparent temperature", suggested: "Suggested cooling target",
        chosen: "Planning target", reset: "Use suggestion",
        advisory: "Estimate from temperature and humidity; assumes 0.1 m/s indoor air speed. Saved in this browser; does not control equipment.",
        waiting: "The target will appear when temperature and humidity readings arrive."
    };
    const [tab, setTab] = useState<Tab>("overview");
'@
Replace-Once '    const [error, setError] = useState("");' @'
    const [error, setError] = useState("");
    const [targetOverride, setTargetOverride] = useState<number | null>(null);
    const preferenceKey = `ruby.bas.target.${tenantId}.${siteId}`;
    useEffect(() => {
        try {
            const stored = localStorage.getItem(preferenceKey);
            const value = stored === null ? null : Number(stored);
            setTargetOverride(value !== null && Number.isFinite(value) && value >= 68 && value <= 78 ? value : null);
        } catch { setTargetOverride(null); }
    }, [preferenceKey]);
    function setPlanningTarget(value: number | null) {
        setTargetOverride(value);
        try {
            if (value === null) localStorage.removeItem(preferenceKey);
            else localStorage.setItem(preferenceKey, String(value));
        } catch { /* Browser storage may be unavailable. */ }
    }
'@
Replace-Once '    const latest = samples[0];' @'
    const latest = samples[0];
    const apparent = latest?.temperature !== undefined && latest.humidity !== undefined
        ? apparentTemperatureF(latest.temperature, latest.humidity) : null;
    const suggested = latest?.humidity !== undefined ? suggestedCoolingTargetF(latest.humidity) : null;
    const planningTarget = targetOverride ?? suggested;
'@
Replace-Once '        <div className="bas-history">' @'
        <div className="bas-comfort">
            <h2>{comfortLabels.suggested}</h2>
            {suggested === null || apparent === null ? <p>{comfortLabels.waiting}</p> : <>
                <div className="bas-comfort-values">
                    <p><span>{comfortLabels.apparent}</span><strong>{fmt(apparent, " °F")}</strong></p>
                    <p><span>{comfortLabels.suggested}</span><strong>{fmt(suggested, " °F")}</strong></p>
                </div>
                <label htmlFor="bas-target">{comfortLabels.chosen}: <strong>{fmt(planningTarget ?? undefined, " °F")}</strong></label>
                <input id="bas-target" type="range" min="68" max="78" step="0.5"
                    value={planningTarget ?? 72} onChange={event => setPlanningTarget(Number(event.target.value))} />
                {targetOverride !== null && <button type="button" onClick={() => setPlanningTarget(null)}>{comfortLabels.reset}</button>}
                <p className="bas-comfort-note">{comfortLabels.advisory}</p>
            </>}
        </div>
        <div className="bas-history">
'@
$logic = @'
/** Apparent temperature with a fixed indoor air speed of 0.1 m/s. */
export function apparentTemperatureF(temperatureF: number, humidityPercent: number): number | null {
    if (!Number.isFinite(temperatureF) || !Number.isFinite(humidityPercent) ||
        temperatureF < 32 || temperatureF > 110 || humidityPercent < 0 || humidityPercent > 100) return null;
    const celsius = (temperatureF - 32) * 5 / 9;
    const vaporPressure = humidityPercent / 100 * 6.105 * Math.exp(17.27 * celsius / (237.7 + celsius));
    return (celsius + 0.33 * vaporPressure - 0.7 * 0.1 - 4) * 9 / 5 + 32;
}
/** Dry-bulb target approximating a 72°F apparent comfort target. */
export function suggestedCoolingTargetF(humidityPercent: number): number | null {
    if (!Number.isFinite(humidityPercent) || humidityPercent < 0 || humidityPercent > 100) return null;
    let low = 65;
    let high = 80;
    for (let index = 0; index < 32; index += 1) {
        const midpoint = (low + high) / 2;
        const apparent = apparentTemperatureF(midpoint, humidityPercent);
        if (apparent === null) return null;
        if (apparent < 72) low = midpoint;
        else high = midpoint;
    }
    return Math.round(Math.max(68, Math.min(78, (low + high) / 2)) * 2) / 2;
}
'@
$style = @'

.bas-comfort { margin: 18px 0; padding: 18px; border: 2px solid #6488a5; border-radius: 12px; background: #202e43; }
.bas-comfort h2 { margin: 0 0 12px; font-size: 1.2rem; }
.bas-comfort-values { display: flex; flex-wrap: wrap; gap: 12px; }
.bas-comfort-values p { min-width: 210px; margin: 0 0 14px; padding: 12px; border: 1px solid #6488a5; border-radius: 8px; }
.bas-comfort-values span, .bas-comfort-values strong { display: block; }
.bas-comfort-values strong { margin-top: 6px; font-size: 1.5rem; }
.bas-comfort label { display: block; font-weight: 700; }
.bas-comfort input[type="range"] { display: block; width: min(100%, 520px); margin: 16px 0; accent-color: #87eee1; }
.bas-comfort button { color: #fff; background: #305d73; border: 2px solid #87eee1; border-radius: 8px; padding: 8px 12px; font: inherit; font-weight: 700; cursor: pointer; }
.bas-comfort button:focus-visible, .bas-comfort input:focus-visible { outline: 3px solid #ffdc82; outline-offset: 3px; }
.bas-comfort-note { max-width: 75ch; color: #d5e5f2; font-size: .95rem; }
'@
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($logicPath, $logic + "`n", $utf8)
[IO.File]::WriteAllText($sourcePath, $source, $utf8)
[IO.File]::AppendAllText($cssPath, $style + "`n", $utf8)
Write-Host 'BAS comfort suggestion installed. Run pnpm --filter @intrusionshield/admin-portal build.'
