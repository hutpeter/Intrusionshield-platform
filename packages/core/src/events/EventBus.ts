import type { IEvent } from "./abstractions/IEvent.js";
import type { IEventBus } from "./abstractions/IEventBus.js";
import type { IEventHandler } from "./abstractions/IEventHandler.js";
import type { IEventPublisher } from "./abstractions/IEventPublisher.js";

/**
 * Optional logging interface for the in-memory event bus.
 *
 * Core deliberately does not depend on a specific logging
 * implementation.
 */
export interface EventLogger {
    info?(message: string): void;
    error?(message: string, error?: unknown): void;
}

/**
 * In-memory implementation of the IntrusionShield event bus.
 *
 * This implementation is intentionally transport-independent.
 *
 * It is suitable for in-process module communication and provides
 * the abstraction boundary required for future distributed event
 * transports such as Azure Service Bus, RabbitMQ, or Kafka.
 */
export class EventBus
    implements IEventBus, IEventPublisher
{
    private readonly handlers = new Map<
        string,
        Set<IEventHandler<IEvent>>
    >();

    public constructor(
        private readonly logger?: EventLogger
    ) {}

    /**
     * Subscribes an event handler to an event type.
     *
     * @param type Event type.
     * @param handler Handler responsible for processing the event.
     */
    public subscribe<T extends IEvent>(
        type: string,
        handler: IEventHandler<T>
    ): void {
        let handlers = this.handlers.get(type);

        if (!handlers) {
            handlers = new Set<IEventHandler<IEvent>>();

            this.handlers.set(type, handlers);
        }

        handlers.add(
            handler as IEventHandler<IEvent>
        );

        this.logger?.info?.(
            `Subscribed to ${type}`
        );
    }

    /**
     * Removes an event handler from an event type.
     *
     * @param type Event type.
     * @param handler Handler to remove.
     */
    public unsubscribe<T extends IEvent>(
        type: string,
        handler: IEventHandler<T>
    ): void {
        const handlers = this.handlers.get(type);

        if (!handlers) {
            return;
        }

        handlers.delete(
            handler as IEventHandler<IEvent>
        );

        if (handlers.size === 0) {
            this.handlers.delete(type);
        }

        this.logger?.info?.(
            `Unsubscribed from ${type}`
        );
    }

    /**
     * Publishes an event to all registered handlers.
     *
     * Handlers are invoked sequentially.
     *
     * A failure in one handler is logged and does not prevent
     * subsequent handlers from receiving the event.
     *
     * @param event Event to publish.
     */
    public async publish<T extends IEvent>(
        event: T
    ): Promise<void> {
        const handlers = this.handlers.get(event.type);

        if (!handlers || handlers.size === 0) {
            return;
        }

        this.logger?.info?.(
            `Publishing event ${event.type}`
        );

        for (const handler of handlers) {
            try {
                await handler.handle(event);
            } catch (error) {
                this.logger?.error?.(
                    `Event handler failure: ${event.type}`,
                    error
                );
            }
        }
    }

    /**
     * Publishes multiple events sequentially.
     *
     * @param events Events to publish.
     */
    public async publishMany<T extends IEvent>(
        events: T[]
    ): Promise<void> {
        for (const event of events) {
            await this.publish(event);
        }
    }

    /**
     * Removes all registered event handlers.
     */
    public clear(): void {
        this.handlers.clear();
    }
}