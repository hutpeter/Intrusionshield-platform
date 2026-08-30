import type { IEvent } from "./abstractions/IEvent.js";
import type { IEventBus } from "./abstractions/IEventBus.js";
import type { IEventHandler } from "./abstractions/IEventHandler.js";
import type { IEventPublisher } from "./abstractions/IEventPublisher.js";

export interface EventLogger {
    info?(message: string): void;
    error?(message: string, error?: unknown): void;
}

export class EventBus implements IEventBus, IEventPublisher {
    private readonly handlers = new Map<string, Set<IEventHandler<IEvent>>>();

    public constructor(private readonly logger?: EventLogger) {}

    public subscribe<T extends IEvent>(type: string, handler: IEventHandler<T>): void {
        let handlers = this.handlers.get(type);
        if (!handlers) {
            handlers = new Set<IEventHandler<IEvent>>();
            this.handlers.set(type, handlers);
        }
        handlers.add(handler as IEventHandler<IEvent>);
        this.logger?.info?.(`Subscribed to ${type}`);
    }

    public unsubscribe<T extends IEvent>(type: string, handler: IEventHandler<T>): void {
        const handlers = this.handlers.get(type);
        if (!handlers) return;
        handlers.delete(handler as IEventHandler<IEvent>);
        if (handlers.size === 0) this.handlers.delete(type);
        this.logger?.info?.(`Unsubscribed from ${type}`);
    }

    public async publish<T extends IEvent>(event: T): Promise<void> {
        const handlers = this.handlers.get(event.type);
        if (!handlers || handlers.size === 0) return;

        this.logger?.info?.(`Publishing event ${event.type}`);
        for (const handler of handlers) {
            try {
                await handler.handle(event);
            } catch (error) {
                this.logger?.error?.(`Event handler failure: ${event.type}`, error);
            }
        }
    }

    public async publishMany<T extends IEvent>(events: T[]): Promise<void> {
        for (const event of events) await this.publish(event);
    }

    public clear(): void {
        this.handlers.clear();
    }
}
