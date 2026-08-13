/** Application configuration. */
export interface ApplicationConfiguration {
    name: string;
    version: string;
    environment: string;
    host: string;
    port: number;
}

/** Database connection pool configuration. */
export interface DatabasePoolConfiguration {
    max: number;
    min: number;
}

/** Database configuration. */
export interface DatabaseConfiguration {
    server: string;
    port: number;
    database: string;
    schema: string;
    username?: string;
    password?: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    pool: DatabasePoolConfiguration;
}

/** Logging configuration. */
export interface LoggingConfiguration {
    level: string;
    format: string;
    console: boolean;
    file: { enabled: boolean; path: string };
    audit: { enabled: boolean; retentionDays: number };
}

/** Platform feature configuration. */
export interface FeaturesConfiguration {
    aiHub: boolean;
    workflow: boolean;
    compliance: boolean;
    analytics: boolean;
    security: boolean;
}

/** AI Hub configuration. */
export interface AiConfiguration {
    enabled: boolean;
    defaultProvider: string;
    routerMode: "automatic" | "user" | "hybrid";
    timeoutMs: number;
    maxRetries: number;
}

/** Workflow engine configuration. */
export interface WorkflowConfiguration {
    enabled: boolean;
    executionMode: "synchronous" | "asynchronous" | "hybrid";
    defaultTimeoutMs: number;
    maxConcurrentExecutions: number;
}

/** Compliance framework engine configuration. */
export interface ComplianceConfiguration {
    enabled: boolean;
    defaultFramework: string;
    assessmentMode: "manual" | "automated" | "hybrid";
    evidenceRetentionDays: number;
}

/** Security analytics configuration. */
export interface AnalyticsConfiguration {
    enabled: boolean;
    ingestionBatchSize: number;
    retentionDays: number;
    anomalyDetection: boolean;
}

/** Complete IntrusionShield configuration. */
export interface Configuration {
    application: ApplicationConfiguration;
    database: DatabaseConfiguration;
    logging: LoggingConfiguration;
    features: FeaturesConfiguration;
    ai: AiConfiguration;
    workflow: WorkflowConfiguration;
    compliance: ComplianceConfiguration;
    analytics: AnalyticsConfiguration;
}