
import {
    bootstrapConfig,
    type BootstrapServiceId
} from "./bootstrapConfig.js";

import {
    startService
} from "./serviceSupervisor.js";

import {
    serviceRegistry
} from "./serviceRegistry.js";

import {
    checkServiceHealth
} from "./serviceHealth.js";

import {
    isServiceIntentionallyStopped
} from "./serviceStopState.js";
type BootstrapEvent = {
    readonly timestamp: string;
    readonly serviceId: string;
    readonly eventType: string;
    readonly message: string;
};

const events: BootstrapEvent[] = [];

function recordEvent(
    serviceId: string,
    eventType: string,
    message: string
): void {
    const event: BootstrapEvent = {
        timestamp: new Date().toISOString(),
        serviceId,
        eventType,
        message
    };

    events.push(event);

    if (events.length > 500) {
        events.shift();
    }

    console.log(
        `[Ruby Bootstrap] ${event.timestamp} ` +
        `[${serviceId}] ${eventType}: ${message}`
    );
}

export function getBootstrapEvents():
    readonly BootstrapEvent[] {
    return [...events];
}

async function isServiceHealthy(
    serviceId: BootstrapServiceId
): Promise<boolean> {
    const service = serviceRegistry.find(
        (candidate) => candidate.id === serviceId
    );

    if (service === undefined) {
        throw new Error(
            `Service '${serviceId}' is missing from the registry.`
        );
    }

    const health = await checkServiceHealth(service);

    return health.status === "healthy";
}

async function startConfiguredService(
    serviceId: BootstrapServiceId
): Promise<void> {
    const config = bootstrapConfig.services.find(
        (candidate) => candidate.serviceId === serviceId
    );

    if (config === undefined || !config.enabled) {
        return;
    }

    if (isServiceIntentionallyStopped(serviceId)) {
        recordEvent(
            serviceId,
            "INTENTIONALLY_STOPPED",
            "Skipping automatic startup because an administrator-stop record exists."
        );
        return;
    }

    if (await isServiceHealthy(serviceId)) {
        recordEvent(
            serviceId,
            "ALREADY_HEALTHY",
            "Service is already running."
        );
        return;
    }

    for (const dependency of config.dependencies) {
        if (!(await isServiceHealthy(dependency))) {
            throw new Error(
                `Dependency '${dependency}' is not healthy.`
            );
        }
    }

    recordEvent(
        serviceId,
        "STARTING",
        "Starting configured service."
    );

    await startService(serviceId);

    recordEvent(
        serviceId,
        "STARTED",
        "Service started and passed health verification."
    );
}

export async function bootstrapServices():
    Promise<void> {
    if (!bootstrapConfig.enabled) {
        recordEvent(
            "platform",
            "DISABLED",
            "Automatic bootstrap is disabled."
        );
        return;
    }

    recordEvent(
        "platform",
        "BOOTSTRAP_STARTED",
        "Starting Ruby service bootstrap."
    );

    for (const config of bootstrapConfig.services) {
        if (!config.enabled) {
            continue;
        }

        try {
            await startConfiguredService(config.serviceId);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Unknown startup error.";

            recordEvent(
                config.serviceId,
                "START_FAILED",
                message
            );

            if (config.required) {
                recordEvent(
                    "platform",
                    "REQUIRED_SERVICE_FAILED",
                    `Required service '${config.serviceId}' failed.`
                );
            }
        }
    }

    recordEvent(
        "platform",
        "BOOTSTRAP_COMPLETED",
        "Ruby service bootstrap sequence completed."
    );
}
