 /**
  * Application configuration.
  */
export interface ApplicationConfiguration {
    name: string;
    version: string;
    environment: string;
    host: string;
    port: number;
}

/**
 * Database connection pool configuration.
 */
export interface DatabasePoolConfiguration {
    max: number;
    min: number;
}

/**
 * Database configuration.
 */
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

/**
 * Logging configuration.
 */
export interface LoggingConfiguration {
    level: string;
    format: string;
    console: boolean;

    file: {
        enabled: boolean;
        path: string;
    };

    audit: {
        enabled: boolean;
        retentionDays: number;
    };
}

/**
 * Platform feature configuration.
 */
export interface FeaturesConfiguration {
    aiHub: boolean;
    workflow: boolean;
    compliance: boolean;
    analytics: boolean;
    security: boolean;
}

/**
 * Complete IntrusionShield configuration.
 */
export interface Configuration {
    application: ApplicationConfiguration;
    database: DatabaseConfiguration;
    logging: LoggingConfiguration;
    features: FeaturesConfiguration;
}