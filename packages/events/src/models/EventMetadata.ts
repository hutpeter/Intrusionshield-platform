
export interface EventMetadata {
    version?: string;

    tenantId?: string;
    userId?: string;

    correlationId?: string;
    causationId?: string;

    source?: string;
}

