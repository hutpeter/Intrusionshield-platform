import { randomUUID } from "node:crypto";

import type { IEvent } from "../abstractions/IEvent.js";
import type { EventMetadata } from "./EventMetadata.js";

export class Event<TPayload = unknown>
    implements IEvent<TPayload>
{
    public readonly id: string;

    public readonly version: string;

    public readonly timestamp: Date;

    public readonly tenantId?: string;

    public readonly userId?: string;

    public readonly correlationId?: string;

    public readonly causationId?: string;

    public readonly source?: string;

    public constructor(
        public readonly type: string,
        public readonly payload: TPayload,
        metadata: EventMetadata = {}
    ) {
        this.id = randomUUID();

        this.version = "1.0";

        this.timestamp = new Date();

        this.tenantId = metadata.tenantId;

        this.userId = metadata.userId;

        this.correlationId = metadata.correlationId;

        this.causationId = metadata.causationId;

        this.source = metadata.source;
    }
}

