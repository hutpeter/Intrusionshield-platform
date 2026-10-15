
export type BootstrapServiceId =
    | "gateway"
    | "authentication"
    | "his"
    | "telemetry-energy";

export interface BootstrapServiceConfig {
    readonly serviceId: BootstrapServiceId;
    readonly enabled: boolean;
    readonly required: boolean;
    readonly dependencies: readonly BootstrapServiceId[];
}

export interface BootstrapConfig {
    readonly enabled: boolean;
    readonly healthCheckIntervalMs: number;
    readonly maximumRestartAttempts: number;
    readonly restartBackoffMs: number;
    readonly services: readonly BootstrapServiceConfig[];
}

function readBoolean(
    value: string | undefined,
    defaultValue: boolean
): boolean {
    if (value === undefined) {
        return defaultValue;
    }

    if (value === "true") {
        return true;
    }

    if (value === "false") {
        return false;
    }

    throw new Error(
        `Invalid boolean configuration value: '${value}'.`
    );
}

function readPositiveInteger(
    value: string | undefined,
    defaultValue: number
): number {
    if (value === undefined) {
        return defaultValue;
    }

    const parsed = Number(value);

    if (
        !Number.isSafeInteger(parsed) ||
        parsed <= 0
    ) {
        throw new Error(
            `Invalid positive integer configuration value: '${value}'.`
        );
    }

    return parsed;
}

export const bootstrapConfig: BootstrapConfig = {
    enabled: readBoolean(
        process.env.RUBY_AUTO_BOOTSTRAP_ENABLED,
        false
    ),

    healthCheckIntervalMs: readPositiveInteger(
        process.env.RUBY_HEALTH_CHECK_INTERVAL_MS,
        10000
    ),

    maximumRestartAttempts: readPositiveInteger(
        process.env.RUBY_MAX_RESTART_ATTEMPTS,
        3
    ),

    restartBackoffMs: readPositiveInteger(
        process.env.RUBY_RESTART_BACKOFF_MS,
        5000
    ),

    services: [
        {
            serviceId: "authentication",
            enabled: true,
            required: true,
            dependencies: []
        },
        {
            serviceId: "gateway",
            enabled: true,
            required: true,
            dependencies: ["authentication"]
        },
        {
            serviceId: "his",
            enabled: true,
            required: false,
            dependencies: ["authentication"]
        },
        {
            serviceId: "telemetry-energy",
            enabled: true,
            required: false,
            dependencies: ["authentication"]
        }
    ]
};
