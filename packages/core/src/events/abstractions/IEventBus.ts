import type { IEvent } from "./IEvent.js";
import type { IEventHandler } from "./IEventHandler.js";

/**
 * Defines the contract for the platform event bus.
 *
 * The event bus provides in-process event publication and
 * subscription without coupling consumers to a specific
 * messaging technology.
 */
export interface IEventBus {
    /**
     * Publishes an event to all registered handlers.
     *
     * @param event Event to publish.
     */
    publish<T extends IEvent>(
        event: T
    ): Promise<void>;

    /**
     * Publishes multiple events.
     *
     * @param events Events to publish.
     */
    publishMany<T extends IEvent>(
        events: T[]
    ): Promise<void>;

    /**
     * Subscribes an event handler to an event type.
     *
     * @param type Event type.
     * @param handler Handler responsible for processing the event.
     */
    subscribe<T extends IEvent>(
        type: string,
        handler: IEventHandler<T>
    ): void;

    /**
     * Removes an event handler from an event type.
     *
     * @param type Event type.
     * @param handler Handler to remove.
     */
    unsubscribe<T extends IEvent>(
        type: string,
        handler: IEventHandler<T>
    ): void;
}