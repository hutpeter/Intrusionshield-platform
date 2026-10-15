```ts
import type { Identifier } from "@intrusionshield/common";
import { Entity } from "./Entity.js";
import { DomainEvent } from "../events/DomainEvent.js";

export abstract class AggregateRoot<
    TId extends Identifier<unknown>
> extends Entity<TId> {
    private readonly domainEvents: DomainEvent[] = [];

    private version = 0;

    protected constructor(id: TId) {
        super(id);
    }

    public getVersion(): number {
        return this.version;
    }

    public incrementVersion(): void {
        this.version++;
    }

    protected raise(event: DomainEvent): void {
        this.domainEvents.push(event);
    }

    public pullEvents(): DomainEvent[] {
        const events = [...this.domainEvents];

        this.domainEvents.length = 0;

        return events;
    }
}

