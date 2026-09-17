import { describe, expect, it, jest } from "@jest/globals";
import type { AlarmEvent, AlarmRule } from "@intrusionshield/energy";
import {
    AlarmEvaluator,
    type NumericAlarmReading
} from "../application/AlarmEvaluator.js";

const tenantId = "73c28616-633a-46b5-bd4d-2ad7971af02c";
const siteId = "138c8b96-04ae-402d-93f9-89b3677734e1";
const deviceId = "2ae890eb-2646-4727-9606-3020ba6afa4c";
const ruleId = "bf8f9f16-d74a-447a-97b1-9fed76f4862e";

function rule(durationSeconds: number): AlarmRule {
    const now = new Date("2026-09-17T12:00:00.000Z");

    return {
        id: ruleId,
        tenantId,
        siteId,
        measurementCode: "battery.state_of_charge",
        name: "Battery High SOC",
        operator: "GTE",
        threshold: 90,
        severity: "WARNING",
        enabled: true,
        durationSeconds,
        createdAt: now,
        updatedAt: now,
        version: 1
    };
}

function reading(
    value: number,
    observedAt: string
): NumericAlarmReading {
    return {
        tenantId,
        siteId,
        deviceId,
        measurementCode: "battery.state_of_charge",
        value,
        observedAt: new Date(observedAt),
        source: "integration.alarm-duration-test"
    };
}

function openEvent(observedAt: string): AlarmEvent {
    const at = new Date(observedAt);

    return {
        id: "11111111-1111-4111-8111-111111111111",
        tenantId,
        siteId,
        deviceId,
        alarmRuleId: ruleId,
        severity: "WARNING",
        state: "OPEN",
        title: "Battery High SOC",
        message: "battery.state_of_charge 95 GTE threshold 90.",
        measurementCode: "battery.state_of_charge",
        measuredValue: 95,
        thresholdValue: 90,
        source: "system.alarm-evaluator",
        occurredAt: at,
        createdAt: at,
        updatedAt: at,
        version: 1
    };
}

function harness(durationSeconds: number) {
    let currentOpen: AlarmEvent | null = null;

    const rules = {
        findApplicable: jest.fn(async () => [rule(durationSeconds)])
    };

    const events = {
        findOpenForRule: jest.fn(async () => currentOpen),
        create: jest.fn(async (input: any) => {
            currentOpen = openEvent(input.occurredAt.toISOString());
            return currentOpen;
        }),
        resolveForRule: jest.fn(async (
            _tenantId: string,
            _siteId: string,
            _alarmRuleId: string,
            _deviceId: string | undefined,
            _resolvedAt: Date
        ) => {
            currentOpen = null;
        })
    };

    return {
        evaluator: new AlarmEvaluator(rules, events),
        events
    };
}

describe("AlarmEvaluator sustained duration", () => {
    it("creates an immediate alarm when durationSeconds is zero", async () => {
        const { evaluator, events } = harness(0);

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:00.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(1);
    });

    it("requires a continuous violation for the configured duration", async () => {
        const { evaluator, events } = harness(60);

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:00.000Z")
        );
        await evaluator.evaluate(
            reading(94, "2026-09-17T12:00:30.000Z")
        );

        expect(events.create).not.toHaveBeenCalled();

        await evaluator.evaluate(
            reading(93, "2026-09-17T12:01:00.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(1);
    });

    it("resets the pending duration when the condition clears", async () => {
        const { evaluator, events } = harness(60);

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:00.000Z")
        );
        await evaluator.evaluate(
            reading(80, "2026-09-17T12:00:30.000Z")
        );
        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:45.000Z")
        );
        await evaluator.evaluate(
            reading(95, "2026-09-17T12:01:15.000Z")
        );

        expect(events.create).not.toHaveBeenCalled();

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:01:45.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(1);
    });

    it("does not duplicate an alarm while one is already open", async () => {
        const { evaluator, events } = harness(0);

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:00.000Z")
        );
        await evaluator.evaluate(
            reading(96, "2026-09-17T12:00:05.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(1);
    });

    it("resolves on recovery and permits a later sustained retrigger", async () => {
        const { evaluator, events } = harness(30);

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:00.000Z")
        );
        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:30.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(1);

        await evaluator.evaluate(
            reading(80, "2026-09-17T12:00:35.000Z")
        );

        expect(events.resolveForRule).toHaveBeenCalledTimes(1);
        expect(events.resolveForRule).toHaveBeenCalledWith(
            tenantId,
            siteId,
            ruleId,
            deviceId,
            new Date("2026-09-17T12:00:35.000Z")
        );

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:01:00.000Z")
        );
        await evaluator.evaluate(
            reading(95, "2026-09-17T12:01:29.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(1);

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:01:30.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(2);
    });

    it("ignores an out-of-order violating reading", async () => {
        const { evaluator, events } = harness(60);

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:30.000Z")
        );
        await evaluator.evaluate(
            reading(95, "2026-09-17T12:00:10.000Z")
        );
        await evaluator.evaluate(
            reading(95, "2026-09-17T12:01:29.000Z")
        );

        expect(events.create).not.toHaveBeenCalled();

        await evaluator.evaluate(
            reading(95, "2026-09-17T12:01:30.000Z")
        );

        expect(events.create).toHaveBeenCalledTimes(1);
    });
});
