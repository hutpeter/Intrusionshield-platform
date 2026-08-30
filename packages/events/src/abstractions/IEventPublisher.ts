import type { IEvent } from "./IEvent.js";

export interface IEventPublisher {
    publish<T extends IEvent>(event: T): Promise<void>;
    publishMany<T extends IEvent>(events: T[]): Promise<void>;
}
