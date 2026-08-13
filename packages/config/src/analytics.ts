import type { AnalyticsConfiguration } from "./types/configuration.js";
import { ConfigurationError } from "./errors/ConfigurationError.js";

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

function nonNegativeInteger(value: string | undefined, fallback: number, name: string): number {
    const parsed = value === undefined ? fallback : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ConfigurationError(`${name} must be a non-negative integer.`, { name, value });
    }
    return parsed;
}

export function getAnalyticsConfiguration(): AnalyticsConfiguration {
    return {
        enabled: booleanValue(process.env.ANALYTICS_ENABLED, true, "ANALYTICS_ENABLED"),
        ingestionBatchSize: positiveInteger(process.env.ANALYTICS_INGESTION_BATCH_SIZE, 500, "ANALYTICS_INGESTION_BATCH_SIZE"),
        retentionDays: nonNegativeInteger(process.env.ANALYTICS_RETENTION_DAYS, 365, "ANALYTICS_RETENTION_DAYS"),
        anomalyDetection: booleanValue(process.env.ANALYTICS_ANOMALY_DETECTION, true, "ANALYTICS_ANOMALY_DETECTION")
    };
}
