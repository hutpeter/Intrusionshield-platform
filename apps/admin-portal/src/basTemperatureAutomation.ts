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
