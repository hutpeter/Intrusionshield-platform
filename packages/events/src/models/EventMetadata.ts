export interface EventMetadata {
    tenantId?: string;
    userId?: string;
    correlationId?: string;
    causationId?: string;
    source?: string;
}
