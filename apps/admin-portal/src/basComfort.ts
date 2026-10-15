/** Apparent temperature with a fixed indoor air speed of 0.1 m/s. */
export function apparentTemperatureF(temperatureF: number, humidityPercent: number): number | null {
    if (!Number.isFinite(temperatureF) || !Number.isFinite(humidityPercent) ||
        temperatureF < 32 || temperatureF > 110 || humidityPercent < 0 || humidityPercent > 100) return null;
    const celsius = (temperatureF - 32) * 5 / 9;
    const vaporPressure = humidityPercent / 100 * 6.105 * Math.exp(17.27 * celsius / (237.7 + celsius));
    return (celsius + 0.33 * vaporPressure - 0.7 * 0.1 - 4) * 9 / 5 + 32;
}
/** Dry-bulb target approximating a 72Â°F apparent comfort target. */
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
