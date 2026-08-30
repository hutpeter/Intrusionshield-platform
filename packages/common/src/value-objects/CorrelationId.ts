import { Identifier } from "./Identifier.js";

export class CorrelationId extends Identifier<CorrelationId> {
    private constructor(value: string) {
        super(value);
    }

    public static create(value?: string): CorrelationId {
        const identifier = Identifier.create<CorrelationId>(value);
        return new CorrelationId(identifier.value);
    }
}
