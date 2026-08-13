import type { WorkflowConfiguration } from "./types/configuration.js";
import { ConfigurationError } from "./errors/ConfigurationError.js";

const MODES = new Set(["synchronous", "asynchronous", "hybrid"]);

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

export function getWorkflowConfiguration(): WorkflowConfiguration {
    const executionMode = (process.env.WORKFLOW_EXECUTION_MODE ?? "hybrid").trim().toLowerCase();
    if (!MODES.has(executionMode)) {
        throw new ConfigurationError("WORKFLOW_EXECUTION_MODE is invalid.", { name: "WORKFLOW_EXECUTION_MODE", value: executionMode });
    }

    return {
        enabled: booleanValue(process.env.WORKFLOW_ENABLED, true, "WORKFLOW_ENABLED"),
        executionMode: executionMode as WorkflowConfiguration["executionMode"],
        defaultTimeoutMs: positiveInteger(process.env.WORKFLOW_TIMEOUT_MS, 60000, "WORKFLOW_TIMEOUT_MS"),
        maxConcurrentExecutions: positiveInteger(process.env.WORKFLOW_MAX_CONCURRENT, 20, "WORKFLOW_MAX_CONCURRENT")
    };
}
