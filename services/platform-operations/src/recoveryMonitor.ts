import {
    bootstrapConfig
} from "./bootstrapConfig.js";

import {
    serviceRegistry
} from "./serviceRegistry.js";

import {
    checkServiceHealth
} from "./serviceHealth.js";

import {
    isServiceManaged,
    startService
} from "./serviceSupervisor.js";

import {
    isServiceIntentionallyStopped
} from "./serviceStopState.js";
type MonitorState = "healthy" | "unhealthy" | "unknown";

const SERVICE_ID = "telemetry-energy";
const FAILURE_THRESHOLD = 3;
const MAX_BACKOFF_MS = 60000;

const autoRecoveryEnabled =
    process.env.RUBY_AUTO_RECOVERY_ENABLED === "true";

let monitorStarted = false;
let checkInProgress = false;
let previousState: MonitorState = "unknown";
let consecutiveFailures = 0;
let recoveryAttempts = 0;
let nextRecoveryAt = 0;

function logEvent(
    eventType: string,
    message: string
): void {
    console.log(
        `[Ruby Recovery] ${new Date().toISOString()} ` +
        `[${SERVICE_ID}] ${eventType}: ${message}`
    );
}

function getService(id: string) {
    const service = serviceRegistry.find(
        (candidate) => candidate.id === id
    );

    if (service === undefined) {
        throw new Error(
            `Service '${id}' is missing from the registry.`
        );
    }

    return service;
}

async function attemptRecovery(): Promise<void> {
    if (isServiceIntentionallyStopped(SERVICE_ID)) {
        logEvent(
            "RECOVERY_SUPPRESSED",
            "Administrator-stop record exists; automatic recovery is prohibited."
        );
        return;
    }

    if (!autoRecoveryEnabled) {
        return;
    }

    if (recoveryAttempts >= bootstrapConfig.maximumRestartAttempts) {
        return;
    }

    if (Date.now() < nextRecoveryAt) {
        return;
    }

    const authentication = getService("authentication");
    const authHealth = await checkServiceHealth(authentication);

    if (authHealth.status !== "healthy") {
        logEvent(
            "RECOVERY_DEFERRED",
            "Authentication dependency is not healthy."
        );
        return;
    }

    if (isServiceManaged(SERVICE_ID)) {
        logEvent(
            "RECOVERY_DEFERRED",
            "A managed process still exists; refusing a duplicate startup."
        );
        return;
    }

    recoveryAttempts++;

    logEvent(
        "RECOVERY_ATTEMPT",
        `Attempt ${recoveryAttempts} of ` +
        `${bootstrapConfig.maximumRestartAttempts}.`
    );

    try {
        await startService(SERVICE_ID);

        recoveryAttempts = 0;
        consecutiveFailures = 0;
        nextRecoveryAt = 0;

        logEvent(
            "RECOVERY_SUCCEEDED",
            "Service started and passed health verification."
        );
    } catch (error) {
        const delayMs = Math.min(
            bootstrapConfig.restartBackoffMs *
                Math.pow(2, recoveryAttempts - 1),
            MAX_BACKOFF_MS
        );

        nextRecoveryAt = Date.now() + delayMs;

        logEvent(
            "RECOVERY_FAILED",
            (error instanceof Error ? error.message : "Unknown error.") +
            ` Next attempt after ${delayMs} ms.`
        );
    }
}

async function checkTelemetryHealth(): Promise<void> {
    if (checkInProgress) {
        return;
    }

    checkInProgress = true;

    try {
        const health = await checkServiceHealth(
            getService(SERVICE_ID)
        );

        const currentState: MonitorState =
            health.status === "healthy"
                ? "healthy"
                : "unhealthy";

        if (currentState !== previousState) {
            logEvent(
                `HEALTH_${currentState.toUpperCase()}`,
                `Service status is ${health.status}.`
            );

            previousState = currentState;
        }

        if (health.status === "healthy") {
            consecutiveFailures = 0;
            recoveryAttempts = 0;
            nextRecoveryAt = 0;
            return;
        }

        if (health.status !== "down") {
            consecutiveFailures = 0;
            return;
        }

        consecutiveFailures++;

        if (consecutiveFailures >= FAILURE_THRESHOLD) {
            await attemptRecovery();
        }
    } catch (error) {
        console.error(
            "[Ruby Recovery] Monitoring error:",
            error instanceof Error ? error.message : "Unknown error."
        );
    } finally {
        checkInProgress = false;
    }
}

export function startRecoveryMonitor(): void {
    if (monitorStarted || !bootstrapConfig.enabled) {
        return;
    }

    monitorStarted = true;

    logEvent(
        "MONITOR_STARTED",
        autoRecoveryEnabled
            ? "Health monitoring and automatic recovery enabled."
            : "Health monitoring enabled; automatic recovery disabled."
    );

    void checkTelemetryHealth();

    setInterval(
        () => {
            void checkTelemetryHealth();
        },
        bootstrapConfig.healthCheckIntervalMs
    );
}