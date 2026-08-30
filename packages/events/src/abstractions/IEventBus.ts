import type { IEvent } from "./IEvent.js";
import type { IEventHandler } from "./IEventHandler.js";

export interface IEventBus {
    publish<T extends IEvent>(event: T): Promise<void>;
    publishMany<T extends IEvent>(events: T[]): Promise<void>;
    subscribe<T extends IEvent>(type: string, handler: IEventHandler<T>): void;
    unsubscribe<T extends IEvent>(type: string, handler: IEventHandler<T>): void;
}
