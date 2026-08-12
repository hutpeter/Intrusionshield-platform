import { Identifier } from "./Identifier";

export class CorrelationId
    extends Identifier<CorrelationId> {

    public static create(): CorrelationId {

        return new CorrelationId();

    }

    private constructor() {

        super();

    }

}