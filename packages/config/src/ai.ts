import type { AiConfiguration } from "./types/configuration.js";
import { ConfigurationError } from "./errors/ConfigurationError.js";

const MODES = new Set(["automatic", "user", "hybrid"]);

function booleanValue(value: string | undefined, fallback: boolean, name: string): boolean {
    if (value === undefined) return fallback;
    if (value === "true") return true;
    if (value === "false") return false;
    throw new ConfigurationError(`${name} must be either true or false.`, { name, value });
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ConfigurationError(`${name} must be a positive integer.`, { name, value });
    }
    return parsed;
}

export function getAiConfiguration(): AiConfiguration {
    const routerMode = (process.env.AI_ROUTER_MODE ?? "hybrid").trim().toLowerCase();
    if (!MODES.has(routerMode)) {
        throw new ConfigurationError("AI_ROUTER_MODE is invalid.", { name: "AI_ROUTER_MODE", value: routerMode });
    }

    return {
        enabled: booleanValue(process.env.AI_ENABLED, true, "AI_ENABLED"),
        defaultProvider: process.env.AI_DEFAULT_PROVIDER?.trim() || "platform",
        routerMode: routerMode as AiConfiguration["routerMode"],
        timeoutMs: positiveInteger(process.env.AI_TIMEOUT_MS, 30000, "AI_TIMEOUT_MS"),
        maxRetries: positiveInteger(process.env.AI_MAX_RETRIES, 2, "AI_MAX_RETRIES")
    };
}
