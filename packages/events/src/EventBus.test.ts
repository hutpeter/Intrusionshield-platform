
import { describe, expect, jest, test } from "@jest/globals";

import { EventBus } from "./EventBus.js";
import { Event } from "./models/Event.js";

describe("EventBus", () => {
    test("publishes an event to subscribed handlers", async () => {
        const bus = new EventBus();
        const handler = {
            handle: jest.fn(async () => undefined)
        };

        const event = new Event(
            "test.event",
            {
                value: "test"
            }
        );

        bus.subscribe(
            event.type,
            handler
        );

        await bus.publish(event);

        expect(handler.handle).toHaveBeenCalledTimes(1);
        expect(handler.handle).toHaveBeenCalledWith(event);
    });

    test("publishes an event to all subscribed handlers", async () => {
        const bus = new EventBus();

        const firstHandler = {
            handle: jest.fn(async () => undefined)
        };

        const secondHandler = {
            handle: jest.fn(async () => undefined)
        };

        const event = new Event(
            "test.event",
            {
                value: "test"
            }
        );

        bus.subscribe(
            event.type,
            firstHandler
        );

        bus.subscribe(
            event.type,
            secondHandler
        );

        await bus.publish(event);

        expect(firstHandler.handle).toHaveBeenCalledTimes(1);
        expect(secondHandler.handle).toHaveBeenCalledTimes(1);
        expect(firstHandler.handle).toHaveBeenCalledWith(event);
        expect(secondHandler.handle).toHaveBeenCalledWith(event);
    });

    test("does nothing when no handlers are subscribed", async () => {
        const bus = new EventBus();

        const event = new Event(
            "test.event",
            {
                value: "test"
            }
        );

        await expect(
            bus.publish(event)
        ).resolves.toBeUndefined();
    });

    test("unsubscribes a handler", async () => {
        const bus = new EventBus();

        const handler = {
            handle: jest.fn(async () => undefined)
        };

        const event = new Event(
            "test.event",
            {
                value: "test"
            }
        );

        bus.subscribe(
            event.type,
            handler
        );

        bus.unsubscribe(
            event.type,
            handler
        );

        await bus.publish(event);

        expect(handler.handle).not.toHaveBeenCalled();
    });

    test("removes the event type when its last handler is unsubscribed", async () => {
        const bus = new EventBus();

        const handler = {
            handle: jest.fn(async () => undefined)
        };

        const event = new Event(
            "test.event",
            {
                value: "test"
            }
        );

        bus.subscribe(
            event.type,
            handler
        );

        bus.unsubscribe(
            event.type,
            handler
        );

        await bus.publish(event);

        expect(handler.handle).not.toHaveBeenCalled();
    });

    test("continues publishing when a handler fails", async () => {
        const logger = {
            error: jest.fn()
        };

        const bus = new EventBus(logger);

        const failingHandler = {
            handle: jest.fn(async () => {
                throw new Error("handler failed");
            })
        };

        const successfulHandler = {
            handle: jest.fn(async () => undefined)
        };

        const event = new Event(
            "test.event",
            {
                value: "test"
            }
        );

        bus.subscribe(
            event.type,
            failingHandler
        );

        bus.subscribe(
            event.type,
            successfulHandler
        );

        await expect(
            bus.publish(event)
        ).resolves.toBeUndefined();

        expect(failingHandler.handle).toHaveBeenCalledTimes(1);
        expect(successfulHandler.handle).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledTimes(1);
        expect(logger.error).toHaveBeenCalledWith(
            "Event handler failure: test.event",
            expect.any(Error)
        );
    });

    test("publishes multiple events in order", async () => {
        const bus = new EventBus();
        const received: string[] = [];

        const handler = {
            handle: jest.fn(async (event: Event<{ value: string }>) => {
                received.push(event.payload.value);
            })
        };

        bus.subscribe(
            "test.event",
            handler
        );

        const events = [
            new Event(
                "test.event",
                {
                    value: "first"
                }
            ),
            new Event(
                "test.event",
                {
                    value: "second"
                }
            ),
            new Event(
                "test.event",
                {
                    value: "third"
                }
            )
        ];

        await bus.publishMany(events);

        expect(received).toEqual([
            "first",
            "second",
            "third"
        ]);

        expect(handler.handle).toHaveBeenCalledTimes(3);
    });

    test("clear removes all subscriptions", async () => {
        const bus = new EventBus();

        const handler = {
            handle: jest.fn(async () => undefined)
        };

        const firstEvent = new Event(
            "first.event",
            {}
        );

        const secondEvent = new Event(
            "second.event",
            {}
        );

        bus.subscribe(
            firstEvent.type,
            handler
        );

        bus.subscribe(
            secondEvent.type,
            handler
        );

        bus.clear();

        await bus.publish(firstEvent);
        await bus.publish(secondEvent);

        expect(handler.handle).not.toHaveBeenCalled();
    });

    test("logs subscriptions and unsubscriptions when a logger is provided", () => {
        const logger = {
            info: jest.fn()
        };

        const bus = new EventBus(logger);

        const handler = {
            handle: jest.fn(async () => undefined)
        };

        bus.subscribe(
            "test.event",
            handler
        );

        bus.unsubscribe(
            "test.event",
            handler
        );

        expect(logger.info).toHaveBeenNthCalledWith(
            1,
            "Subscribed to test.event"
        );

        expect(logger.info).toHaveBeenNthCalledWith(
            2,
            "Unsubscribed from test.event"
        );
    });

    test("logs event publication when handlers are present", async () => {
        const logger = {
            info: jest.fn()
        };

        const bus = new EventBus(logger);

        const handler = {
            handle: jest.fn(async () => undefined)
        };

        const event = new Event(
            "test.event",
            {}
        );

        bus.subscribe(
            event.type,
            handler
        );

        await bus.publish(event);

        expect(logger.info).toHaveBeenCalledWith(
            "Publishing event test.event"
        );
    });
});

