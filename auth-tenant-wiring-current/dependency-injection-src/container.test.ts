
import { describe, expect, jest, test } from "@jest/globals";

import { Container } from "./container.js";

describe("Container", () => {
    test("registers and resolves a dependency", () => {
        const container = new Container();
        const token = Symbol("LOGGER");

        const logger = {
            info: jest.fn()
        };

        container.register(
            token,
            () => logger
        );

        expect(container.has(token)).toBe(true);
        expect(container.resolve<typeof logger>(token)).toBe(logger);
    });

    test("throws when resolving an unregistered dependency", () => {
        const container = new Container();
        const token = Symbol("MISSING");

        expect(() => {
            container.resolve(token);
        }).toThrow("Dependency not registered: MISSING");
    });

    test("throws when registering the same token more than once", () => {
        const container = new Container();
        const token = Symbol("LOGGER");

        container.register(
            token,
            () => ({})
        );

        expect(() => {
            container.register(
                token,
                () => ({})
            );
        }).toThrow("Dependency already registered: LOGGER");
    });

    test("resolves singleton dependencies only once", () => {
        const container = new Container();
        const token = Symbol("SERVICE");
        const factory = jest.fn(() => ({
            id: "service"
        }));

        container.register(
            token,
            factory
        );

        const first = container.resolve<{ id: string }>(token);
        const second = container.resolve<{ id: string }>(token);

        expect(first).toBe(second);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    test("supports singleton dependencies that resolve to undefined", () => {
        const container = new Container();
        const token = Symbol("OPTIONAL");
        const factory = jest.fn(() => undefined);

        container.register(
            token,
            factory
        );

        expect(container.resolve(token)).toBeUndefined();
        expect(container.resolve(token)).toBeUndefined();
        expect(factory).toHaveBeenCalledTimes(1);
    });

    test("supports singleton dependencies that resolve to null", () => {
        const container = new Container();
        const token = Symbol("OPTIONAL");
        const factory = jest.fn(() => null);

        container.register(
            token,
            factory
        );

        expect(container.resolve(token)).toBeNull();
        expect(container.resolve(token)).toBeNull();
        expect(factory).toHaveBeenCalledTimes(1);
    });

    test("supports transient dependencies", () => {
        const container = new Container();
        const token = Symbol("SERVICE");
        const factory = jest.fn(() => ({
            id: "service"
        }));

        container.register(
            token,
            factory,
            {
                singleton: false
            }
        );

        const first = container.resolve<{ id: string }>(token);
        const second = container.resolve<{ id: string }>(token);

        expect(first).not.toBe(second);
        expect(factory).toHaveBeenCalledTimes(2);
    });

    test("allows factories to resolve other dependencies", () => {
        const container = new Container();

        const dependencyToken = Symbol("DEPENDENCY");
        const serviceToken = Symbol("SERVICE");

        const dependency = {
            value: "dependency"
        };

        container.register(
            dependencyToken,
            () => dependency
        );

        container.register(
            serviceToken,
            (currentContainer) => {
                const resolvedDependency =
                    currentContainer.resolve<typeof dependency>(
                        dependencyToken
                    );

                return {
                    dependency: resolvedDependency
                };
            }
        );

        const service = container.resolve(serviceToken);

        expect(service).toEqual({
            dependency
        });
    });

    test("has returns false after clear", () => {
        const container = new Container();
        const token = Symbol("SERVICE");

        container.register(
            token,
            () => ({})
        );

        expect(container.has(token)).toBe(true);

        container.clear();

        expect(container.has(token)).toBe(false);
    });

    test("clear removes registrations and allows the token to be registered again", () => {
        const container = new Container();
        const token = Symbol("SERVICE");

        container.register(
            token,
            () => ({
                value: "first"
            })
        );

        container.clear();

        const second = {
            value: "second"
        };

        container.register(
            token,
            () => second
        );

        expect(
            container.resolve<typeof second>(token)
        ).toBe(second);
    });
});

