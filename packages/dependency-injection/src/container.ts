/**
 * IntrusionShield Dependency Injection Container
 *
 * Provides:
 * - dependency registration
 * - dependency resolution
 * - singleton lifecycle management
 */

export interface Registration {
    factory: (container: Container) => unknown;
    singleton: boolean;
    instance?: unknown;
    initialized: boolean;
}

export class Container {
    private readonly registry: Map<symbol, Registration>;

    public constructor() {
        this.registry = new Map();
    }

    public register(
        token: symbol,
        factory: (container: Container) => unknown,
        options: {
            singleton?: boolean;
        } = {}
    ): void {
        if (this.registry.has(token)) {
            throw new Error(
                `Dependency already registered: ${String(token.description)}`
            );
        }

        this.registry.set(token, {
            factory,
            singleton: options.singleton ?? true,
            initialized: false
        });
    }

    public resolve<T>(token: symbol): T {
        const registration = this.registry.get(token);

        if (registration === undefined) {
            throw new Error(
                `Dependency not registered: ${String(token.description)}`
            );
        }

        if (registration.singleton && registration.initialized) {
            return registration.instance as T;
        }

        const instance = registration.factory(this);

        if (registration.singleton) {
            registration.instance = instance;
            registration.initialized = true;
        }

        return instance as T;
    }

    public has(token: symbol): boolean {
        return this.registry.has(token);
    }

    public clear(): void {
        this.registry.clear();
    }
}