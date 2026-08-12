import { CorrelationId } from "@intrusionshield/common";

export abstract class DomainEvent {

    protected constructor(

        public readonly correlationId: CorrelationId,

        public readonly occurredOn: Date = new Date()

    ) {}

}