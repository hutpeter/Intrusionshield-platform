import type {
    Request,
    Response
} from "express";

export type SiteStreamEventType =
    | "telemetry-reading"
    | "energy-flow";

export interface SiteStreamEvent {
    readonly tenantId: string;
    readonly siteId: string;
    readonly type: SiteStreamEventType;
    readonly data: unknown;
}

interface ConnectOptions {
    readonly tenantId: string;
    readonly siteId: string;
    readonly request: Request;
    readonly response: Response;
}

interface Subscriber {
    readonly tenantId: string;
    readonly siteId: string;
    readonly response: Response;
    readonly heartbeat: NodeJS.Timeout;
}

export class SiteEventStream {
    private readonly subscribers =
        new Set<Subscriber>();

    public connect(options: ConnectOptions): void {
        const {
            tenantId,
            siteId,
            request,
            response
        } = options;

        response.status(200);
        response.setHeader(
            "Content-Type",
            "text/event-stream; charset=utf-8"
        );
        response.setHeader(
            "Cache-Control",
            "no-cache, no-transform"
        );
        response.setHeader(
            "Connection",
            "keep-alive"
        );
        response.setHeader(
            "X-Accel-Buffering",
            "no"
        );
        response.flushHeaders();

        response.write(
            `event: connected\ndata: ${JSON.stringify({
                tenantId,
                siteId,
                connectedAt: new Date().toISOString()
            })}\n\n`
        );

        const subscriber: Subscriber = {
            tenantId,
            siteId,
            response,
            heartbeat: setInterval(() => {
                if (!response.writableEnded) {
                    response.write(
                        `: heartbeat ${new Date().toISOString()}\n\n`
                    );
                }
            }, 20_000)
        };

        this.subscribers.add(subscriber);

        const disconnect = (): void => {
            clearInterval(subscriber.heartbeat);
            this.subscribers.delete(subscriber);
        };

        request.once("close", disconnect);
        response.once("close", disconnect);
    }

    public publish(event: SiteStreamEvent): void {
        const payload =
            `event: ${event.type}\n` +
            `data: ${JSON.stringify(event.data)}\n\n`;

        for (const subscriber of this.subscribers) {
            if (
                subscriber.tenantId !== event.tenantId ||
                subscriber.siteId !== event.siteId ||
                subscriber.response.writableEnded
            ) {
                continue;
            }

            subscriber.response.write(payload);
        }
    }

    public subscriberCount(): number {
        return this.subscribers.size;
    }
}
