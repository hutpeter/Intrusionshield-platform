import type { IEvent } from "./IEvent.js";

/**
 * Defines the contract implemented by event handlers.
 *
 * Event handlers receive a typed event and perform the
 * appropriate module-specific processing.
 *
 * @typeParam TEvent The event type handled by the handler.
 */
export interface IEventHandler<
    TEvent extends IEvent = IEvent
> {
    /**
     * Handles an event.
     *
     * @param event Event being handled.
     */
    handle(event: TEvent): Promise<void>;
}