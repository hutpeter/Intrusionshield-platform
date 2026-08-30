export interface IEvent<TPayload = unknown> {
    id: string;
    type: string;
    version: string;
    timestamp: Date;

    tenantId?: string;
    userId?: string;

    correlationId?: string;
    causationId?: string;

    source?: string;

    payload: TPayload;
}
