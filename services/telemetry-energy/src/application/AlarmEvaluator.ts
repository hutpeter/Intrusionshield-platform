import type {
    AlarmEvent,
    AlarmOperator,
    AlarmRule
} from "@intrusionshield/energy";

export interface NumericAlarmReading {
    readonly tenantId: string;
    readonly siteId: string;
    readonly assetId?: string;
    readonly deviceId: string;
    readonly measurementCode: string;
    readonly value: number;
    readonly observedAt: Date;
    readonly source: string;
}

interface AlarmRuleReader {
    findApplicable(
        tenantId: string,
        siteId: string,
        measurementCode: string
    ): Promise<readonly AlarmRule[]>;
}

interface AlarmEventWriter {
    findOpenForRule(
        tenantId: string,
        siteId: string,
        alarmRuleId: string,
        deviceId?: string
    ): Promise<AlarmEvent | null>;

    create(input: {
        readonly tenantId: string;
        readonly siteId: string;
        readonly assetId?: string;
        readonly deviceId?: string;
        readonly alarmRuleId?: string;
        readonly severity: AlarmRule["severity"];
        readonly state: "OPEN";
        readonly title: string;
        readonly message: string;
        readonly measurementCode?: string;
        readonly measuredValue?: number;
        readonly thresholdValue?: number;
        readonly source: string;
        readonly occurredAt: Date;
    }): Promise<AlarmEvent>;

    resolveForRule(
        tenantId: string,
        siteId: string,
        alarmRuleId: string,
        deviceId: string | undefined,
        resolvedAt: Date
    ): Promise<void>;
}

interface PendingAlarmCondition {
    readonly startedAt: Date;
    readonly lastObservedAt: Date;
}

export class AlarmEvaluator {
    private readonly pendingConditions =
        new Map<string, PendingAlarmCondition>();

    public constructor(
        private readonly rules: AlarmRuleReader,
        private readonly events: AlarmEventWriter
    ) {}

    public async evaluate(reading: NumericAlarmReading): Promise<void> {
        const rules = await this.rules.findApplicable(
            reading.tenantId,
            reading.siteId,
            reading.measurementCode
        );

        for (const rule of rules) {
            await this.evaluateRule(reading, rule);
        }
    }

    private async evaluateRule(
        reading: NumericAlarmReading,
        rule: AlarmRule
    ): Promise<void> {
        const key = pendingKey(reading, rule);
        const triggered = compare(
            reading.value,
            rule.operator,
            rule.threshold
        );

        const open = await this.events.findOpenForRule(
            reading.tenantId,
            reading.siteId,
            rule.id,
            reading.deviceId
        );

        if (!triggered) {
            this.pendingConditions.delete(key);

            if (open) {
                /*
                 * Alarm lifecycle timestamps must stay in the same clock domain
                 * as the telemetry that caused the transition. This is
                 * particularly important for simulators, replayed telemetry and
                 * historical ingestion where observedAt can differ from the
                 * server's wall clock.
                 */
                await this.events.resolveForRule(
                    reading.tenantId,
                    reading.siteId,
                    rule.id,
                    reading.deviceId,
                    reading.observedAt
                );
            }

            return;
        }

        if (open) {
            this.pendingConditions.delete(key);
            return;
        }

        if (rule.durationSeconds === 0) {
            await this.createAlarm(reading, rule);
            return;
        }

        const pending = this.pendingConditions.get(key);

        if (!pending) {
            this.pendingConditions.set(key, {
                startedAt: reading.observedAt,
                lastObservedAt: reading.observedAt
            });
            return;
        }

        /*
         * Telemetry can arrive out of order. An older reading must not move
         * a pending condition backwards or accidentally satisfy its duration.
         */
        if (reading.observedAt < pending.lastObservedAt) {
            return;
        }

        const elapsedMilliseconds =
            reading.observedAt.getTime() - pending.startedAt.getTime();

        if (elapsedMilliseconds >= rule.durationSeconds * 1000) {
            await this.createAlarm(reading, rule);
            this.pendingConditions.delete(key);
            return;
        }

        this.pendingConditions.set(key, {
            startedAt: pending.startedAt,
            lastObservedAt: reading.observedAt
        });
    }

    private async createAlarm(
        reading: NumericAlarmReading,
        rule: AlarmRule
    ): Promise<void> {
        await this.events.create({
            tenantId: reading.tenantId,
            siteId: reading.siteId,
            assetId: reading.assetId,
            deviceId: reading.deviceId,
            alarmRuleId: rule.id,
            severity: rule.severity,
            state: "OPEN",
            title: rule.name,
            message:
                `${reading.measurementCode} ${reading.value} ${describe(rule)}.`,
            measurementCode: reading.measurementCode,
            measuredValue: reading.value,
            thresholdValue: rule.threshold,
            source: "system.alarm-evaluator",
            occurredAt: reading.observedAt
        });
    }
}

function pendingKey(
    reading: NumericAlarmReading,
    rule: AlarmRule
): string {
    return [
        reading.tenantId,
        reading.siteId,
        rule.id,
        reading.deviceId
    ].join(":");
}

function compare(
    value: number,
    operator: AlarmOperator,
    threshold: number
): boolean {
    switch (operator) {
        case "GT":
            return value > threshold;
        case "GTE":
            return value >= threshold;
        case "LT":
            return value < threshold;
        case "LTE":
            return value <= threshold;
        case "EQ":
            return value === threshold;
        case "NEQ":
            return value !== threshold;
    }
}

function describe(rule: AlarmRule): string {
    return `${rule.operator} threshold ${rule.threshold}`;
}
