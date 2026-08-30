import type { IEvent } from "./IEvent.js";

export interface IEventHandler<TEvent extends IEvent = IEvent> {
    handle(event: TEvent): Promise<void>;
}
